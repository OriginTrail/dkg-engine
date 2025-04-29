#!/bin/bash

LOG_FILE="migrate_paranets_$(date +%Y%m%d_%H%M%S).log"
CURL_TIMEOUT=300
MAX_RETRIES=3
CHUNK_SIZE=50000

log_message() {
    local level="$1"
    local message="$2"
    local timestamp
    timestamp=$(date "+%Y-%m-%d %H:%M:%S")
    echo "[$timestamp] [$level] $message" | tee -a "$LOG_FILE"
}

decode_folder_to_ual() {
    local raw="${1#paranet_}"  # Strip "paranet_" prefix
    local network_part=$(echo "$raw" | cut -d_ -f1-4 | tr '_' ':')   # did:dkg:base:84532
    local rest=$(echo "$raw" | cut -d_ -f5- | tr '_' '/')
    echo "${network_part}/${rest}"
}

find_paranet_folders() {
    local folders=()
    for f in paranet_*; do
        if [ -d "$f" ]; then
            folders+=("$f")
        fi
    done
    echo "${folders[@]}"
}

generate_enriched_chunks() {
    local folder="$1"
    local ual="$2"
    local input_file="$folder/$folder/data.nq.gz"
    local chunk_dir="$folder/chunks"
    mkdir -p "$chunk_dir"

    log_message "INFO" "Enriching and chunking $input_file for $ual"

    local chunk_count=0
    local line_count=0
    local chunk_file="$chunk_dir/enriched_chunk_$(printf "%05d" $chunk_count).nq"

    gunzip -c "$input_file" | while IFS= read -r line || [[ -n "$line" ]]; do
        echo "$line" >> "$chunk_file"

        named_graph=$(echo "$line" | awk '{print $4}' | sed 's/[<>]//g')

        echo "<${ual}> <https://ontology.origintrail.io/dkg/1.0#hasNamedGraph> <${named_graph}> <${ual}> ." >> "$chunk_file"

        ((line_count+=2))

        if (( line_count >= CHUNK_SIZE )); then
            ((chunk_count++))
            chunk_file="$chunk_dir/enriched_chunk_$(printf "%05d" $chunk_count).nq"
            line_count=0
        fi
    done

    echo "$((chunk_count + 1))" > "$folder/.total_chunks_created"
    log_message "INFO" "Generated $((chunk_count + 1)) chunks for $folder"
}

process_chunk() {
    local chunk_file="$1"
    local chunk_num="$2"
    local total_chunks="$3"
    local blazegraph_url="http://localhost:9999/blazegraph/namespace/dkg/sparql"
    local retry_count=0
    local success=false

    local line_count
    line_count=$(wc -l < "$chunk_file")

    while [ $retry_count -lt $MAX_RETRIES ] && [ "$success" = false ]; do
        if [ $retry_count -gt 0 ]; then
            log_message "INFO" "Retry $retry_count for chunk $chunk_num"
        fi

        local response
        response=$(curl -s --max-time $CURL_TIMEOUT -X POST \
            -H "Content-Type: text/x-nquads" \
            --data-binary @"$chunk_file" \
            "$blazegraph_url" 2>&1)

        if [[ $response == *"<?xml version=\"1.0\"?><data modified="* ]]; then
            modified=$(echo "$response" | grep -o 'modified="[0-9]*"' | cut -d'"' -f2)
            if [ "$line_count" -eq "$modified" ]; then
                success=true
                log_message "INFO" "Chunk $chunk_num/$total_chunks uploaded successfully"
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
        log_message "ERROR" "Chunk $chunk_num failed after $MAX_RETRIES attempts"
        return 1
    fi

    return 0
}

process_chunks() {
    local folder="$1"
    local chunk_dir="$folder/chunks"
    local total_chunks
    total_chunks=$(cat "$folder/.total_chunks_created" 2>/dev/null)

    shopt -s nullglob
    local chunks=("$chunk_dir"/enriched_chunk_*.nq)
    shopt -u nullglob

    local chunk_num=1
    for chunk in "${chunks[@]}"; do
        job_pool_run process_chunk "$chunk" "$chunk_num" "$total_chunks"
        ((chunk_num++))
    done

    job_pool_wait
}

# === MAIN ===

. ./current/blazegraph-migration/job_pool.sh
job_pool_init 5 0

folders=($(find_paranet_folders))
overall_success=1

if [ ${#folders[@]} -eq 0 ]; then
    log_message "ERROR" "No paranet folders found"
    exit 1
fi

log_message "INFO" "Found paranet folders: ${folders[*]}"

for folder in "${folders[@]}"; do
    log_message "INFO" "Processing $folder"

    done_marker=".paranet_migration_done_$(basename "$folder")"

    input_file="$folder/$folder/data.nq.gz"
    if [ ! -f "$input_file" ]; then
        log_message "ERROR" "Missing data file: $input_file"
        echo "0" > "$done_marker"
        overall_success=0
        continue
    fi

    ual=$(decode_folder_to_ual "$folder")

    generate_enriched_chunks "$folder" "$ual"
    process_chunks "$folder"

    shopt -s nullglob
    failed_chunks=("$folder/chunks"/enriched_chunk_*.nq)
    shopt -u nullglob
    failed_count=${#failed_chunks[@]}
    total_chunks=$(cat "$folder/.total_chunks_created" 2>/dev/null)

    if (( total_chunks == 0 )); then
        log_message "WARN" "No chunks processed for $folder"
        echo "0" > "$done_marker"
        overall_success=0
        continue
    fi

    fail_ratio=$(awk "BEGIN { printf \"%.2f\", ($failed_count / $total_chunks) * 100 }")

    if (( $(awk "BEGIN { print ($fail_ratio > 1.0) }") )); then
        log_message "ERROR" "$failed_count/$total_chunks chunks failed (${fail_ratio}%) — above threshold"
        echo "0" > "$done_marker"
        overall_success=0
    else
        if (( failed_count > 0 )); then
            log_message "WARN" "$failed_count/$total_chunks chunks failed (${fail_ratio}%), but tolerated"
        fi
        echo "1" > "$done_marker"
        log_message "INFO" "Migration success marker written to $done_marker"
    fi
done

job_pool_shutdown
log_message "INFO" "Paranet migration completed"

exit $overall_success