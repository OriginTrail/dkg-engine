#!/bin/bash

LOG_FILE="enrich_parallel_$(date +%Y%m%d_%H%M%S).log"
CURL_TIMEOUT=300
MAX_RETRIES=3
CHUNK_SIZE=50000
FAIL_LIMIT_PERCENT=1.0

log_message() {
    local level="$1"
    local message="$2"
    local timestamp
    timestamp=$(date "+%Y-%m-%d %H:%M:%S")
    echo "[$timestamp] [$level] $message" | tee -a "$LOG_FILE"
}

convert_namespace() {
    local input="$1"
    echo "${input//_/-}"
}

find_target_folders() {
    local folders=()
    if [ -d "dkg" ]; then
        folders+=("dkg")
    fi
    echo "${folders[@]}"
}

generate_enriched_chunks() {
    local input_dir="$1"
    local input_file="$input_dir/$input_dir/data.nq.gz"
    local chunk_dir="$input_dir/chunks"
    mkdir -p "$chunk_dir"

    log_message "INFO" "Streaming and enriching $input_file into chunked enriched files"

    local chunk_count=0
    local line_count=0
    local enriched_chunk_file="$chunk_dir/enriched_chunk_$(printf "%05d" $chunk_count).nq"

    gunzip -c "$input_file" | while IFS= read -r line || [[ -n "$line" ]]; do
        graph_iri=$(echo "$line" | awk '{print $4}' | sed 's/[<>]//g')

        IFS='/' read -ra parts <<< "$graph_iri"
        if [[ ${#parts[@]} -ge 5 ]]; then
            network_prefix="${parts[0]}"                         # did:dkg:otp:2043
            contract="${parts[1]}"
            collection_id="${parts[2]}"
            asset_id="${parts[3]}"
            visibility="${parts[4]}"

            graph_iri_full="<${network_prefix}/${contract}/${collection_id}/${asset_id}/${visibility}>"
            collection_iri="<${network_prefix}/${contract}/${collection_id}>"
            asset_iri="<${network_prefix}/${contract}/${collection_id}/${asset_id}>"

            echo "<current:graph> <https://ontology.origintrail.io/dkg/1.0#hasNamedGraph> ${graph_iri_full} <current:graph> ." >> "$enriched_chunk_file"
            echo "${collection_iri} <https://ontology.origintrail.io/dkg/1.0#hasNamedGraph> ${graph_iri_full} <metadata:graph> ." >> "$enriched_chunk_file"
            echo "${collection_iri} <https://ontology.origintrail.io/dkg/1.0#hasKnowledgeAsset> ${asset_iri} <metadata:graph> ." >> "$enriched_chunk_file"

            ((line_count+=3))
        fi

        if (( line_count >= CHUNK_SIZE * 3 )); then
            ((chunk_count++))
            enriched_chunk_file="$chunk_dir/enriched_chunk_$(printf "%05d" $chunk_count).nq"
            line_count=0
        fi
    done

    echo "$((chunk_count + 1))" > "$input_dir/.total_chunks_created"
    log_message "INFO" "Enriched chunks generated: $((chunk_count + 1))"
}

process_chunk() {
    local chunk_file="$1"
    local chunk_num="$2"
    local blazegraph_url="$3"
    local total_chunks="$4"
    local retry_count=0
    local success=false

    local line_count
    line_count=$(wc -l < "$chunk_file")

    while [ $retry_count -lt $MAX_RETRIES ] && [ "$success" = false ]; do
        if [ $retry_count -gt 0 ]; then
            log_message "INFO" "Retry $retry_count for chunk $chunk_num"
        fi

        local response=$(curl -s --max-time $CURL_TIMEOUT -X POST \
            -H "Content-Type: text/x-nquads" \
            --data-binary @"$chunk_file" \
            "$blazegraph_url" 2>&1)

        if [[ $response == *"<?xml version=\"1.0\"?><data modified="* ]]; then
            modified=$(echo "$response" | grep -o 'modified="[0-9]*"' | cut -d'"' -f2)

            if [ "$line_count" -eq "$modified" ]; then
                success=true
                log_message "INFO" "Successfully processed chunk $chunk_num/$total_chunks"
                rm "$chunk_file"
            else
                log_message "ERROR" "Chunk $chunk_num mismatch (expected $line_count, got $modified)"
                retry_count=$((retry_count + 1))
            fi
        else
            log_message "ERROR" "Chunk $chunk_num failed: $response"
            retry_count=$((retry_count + 1))
        fi

        if [ "$success" = false ]; then
            sleep 5
        fi
    done

    if [ "$success" = false ]; then
        log_message "ERROR" "Failed to process chunk $chunk_num after $MAX_RETRIES retries"
        return 1
    fi

    sleep 2
    return 0
}

process_chunks() {
    local input_dir="$1"
    local chunk_dir="$input_dir/chunks"
    local namespace
    namespace=$(convert_namespace "$(basename "$input_dir")")
    local blazegraph_url="http://localhost:9999/blazegraph/namespace/$namespace/sparql"

    shopt -s nullglob
    local chunks=("$chunk_dir"/enriched_chunk_*.nq)
    shopt -u nullglob
    total_chunks=${#chunks[@]}

    if [ "$total_chunks" -eq 0 ]; then
        log_message "INFO" "No enriched chunks to upload for $input_dir"
        return 0
    fi

    log_message "INFO" "Uploading $total_chunks enriched chunks to $namespace"

    local chunk_num=1
    for chunk in "${chunks[@]}"; do
        job_pool_run process_chunk "$chunk" "$chunk_num" "$blazegraph_url" "$total_chunks"
        chunk_num=$((chunk_num + 1))
    done

    job_pool_wait
}

# === MAIN ===

. ./current/blazegraph-migration/job_pool.sh
job_pool_init 5 0

target_folders=($(find_target_folders))
overall_success=1

if [ ${#target_folders[@]} -eq 0 ]; then
    log_message "ERROR" "No target folders found"
    exit 1
fi

log_message "INFO" "Found folders: ${target_folders[*]}"

for folder in "${target_folders[@]}"; do
    log_message "INFO" "Processing folder: $folder"

    done_marker=".enrichment_migration_done_$(basename "$folder")"

    if [ ! -f "$folder/$folder/data.nq.gz" ]; then
        log_message "ERROR" "Missing file: $folder/$folder/data.nq.gz"
        echo "0" > "$done_marker"
        overall_success=0
        continue
    fi

    generate_enriched_chunks "$folder"
    process_chunks "$folder"

    total_chunks=$(cat "$folder/.total_chunks_created" 2>/dev/null)
    rm -f "$folder/.total_chunks_created"

    shopt -s nullglob
    failed_chunks=("$folder/chunks"/enriched_chunk_*.nq)
    shopt -u nullglob
    failed_count=${#failed_chunks[@]}

    if (( total_chunks == 0 )); then
        log_message "WARN" "No enriched chunks were generated for $folder"
        echo "0" > "$done_marker"
        overall_success=0
        continue
    fi

    fail_ratio=$(awk "BEGIN { printf \"%.2f\", ($failed_count / $total_chunks) * 100 }")

    if (( $(awk "BEGIN { print ($fail_ratio > $FAIL_LIMIT_PERCENT) }") )); then
        log_message "ERROR" "$failed_count/$total_chunks chunks failed (${fail_ratio}%) — above threshold"
        echo "0" > "$done_marker"
        overall_success=0
    else
        if (( failed_count > 0 )); then
            log_message "WARN" "$failed_count/$total_chunks chunks failed (${fail_ratio}%), but within allowed $FAIL_LIMIT_PERCENT%"
        fi
        echo "1" > "$done_marker"
        log_message "INFO" "Migration success marker written to $done_marker"
    fi
done

job_pool_shutdown
log_message "INFO" "Enrichment process completed"

exit $overall_success