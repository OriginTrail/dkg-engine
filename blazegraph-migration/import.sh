#!/bin/bash

LOG_FILE="migration_import_$(date +%Y%m%d_%H%M%S).log"
CURL_TIMEOUT=300
MAX_RETRIES=3
CHUNK_DELAY=2

log_message() {
    local level="$1"
    local message="$2"
    local timestamp=$(date "+%Y-%m-%d %H:%M:%S")
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

    for folder in paranet*; do
        if [ -d "$folder" ]; then
            folders+=("$folder")
        fi
    done
    echo "${folders[@]}"
}

split_into_chunks() {
    local input_dir="$1"
    local chunk_size="$2"
    local input_file="$input_dir/$input_dir/data.nq.gz"
    local output_dir="$input_dir/chunks"
    mkdir -p "$output_dir"

    log_message "INFO" "Starting file split for $input_file"
    gunzip -c "$input_file" | split -l "$chunk_size" --additional-suffix=.nq - "${output_dir}/chunk_"
    log_message "INFO" "File split completed. Output directory: $output_dir"
}

process_chunk() {
    local chunk_file="$1"
    local chunk_num="$2"
    local blazegraph_url="$3"
    local retry_count=0
    local success=false

    while [ $retry_count -lt $MAX_RETRIES ] && [ "$success" = false ]; do
        if [ $retry_count -gt 0 ]; then
            log_message "INFO" "Retry $retry_count for chunk $chunk_num"
        fi

        local chunk_lines=$(wc -l < "$chunk_file")
        local response=$(curl -s --max-time $CURL_TIMEOUT -X POST \
             -H "Content-Type: text/x-nquads" \
             --data-binary @"$chunk_file" \
             "$blazegraph_url" 2>&1)

        if [[ $response == *"<?xml version=\"1.0\"?><data modified="* ]]; then
            local modified=$(echo "$response" | grep -o 'modified="[0-9]*"' | cut -d'"' -f2)

            if [ "$chunk_lines" -eq "$modified" ]; then
                success=true
                log_message "INFO" "Successfully processed chunk $chunk_num of $total_chunks"
                rm "$chunk_file"
            else
                log_message "ERROR" "Chunk $chunk_num processing failed: line count mismatch (expected: $chunk_lines, modified: $modified)"
                retry_count=$((retry_count + 1))
            fi
        else
            log_message "ERROR" "Chunk $chunk_num processing failed: $response"
            retry_count=$((retry_count + 1))
        fi

        if [ $retry_count -lt $MAX_RETRIES ] && [ "$success" = false ]; then
            sleep 5
        fi
    done

    if [ "$success" = false ]; then
        log_message "ERROR" "Failed to process chunk $chunk_num after $MAX_RETRIES attempts"
        sleep 5
        return 1
    fi

    sleep 10
    return 0
}

process_chunks() {
    local input_dir="$1"
    local chunk_dir="$input_dir/chunks"
    local processed_chunks=0
    local failed_chunks=0
    local namespace=$(convert_namespace "$(basename "$input_dir")")
    local blazegraph_url="http://localhost:9999/blazegraph/namespace/$namespace/sparql"

    if [ ! -d "$chunk_dir" ]; then
        log_message "ERROR" "Chunks directory not found: $chunk_dir"
        return 1
    fi

    local chunks=("$chunk_dir"/*.nq)
    total_chunks=${#chunks[@]}

    if [ $total_chunks -eq 0 ]; then
        log_message "ERROR" "No .nq files found in chunks directory: $chunk_dir"
        return 1
    fi

    log_message "INFO" "Starting chunk processing for namespace: $namespace"
    log_message "INFO" "Total chunks to process: $total_chunks"

    local chunk_num=1
    for chunk in "${chunks[@]}"; do
        job_pool_run process_chunk "$chunk" "$chunk_num" "$blazegraph_url"
        chunk_num=$((chunk_num + 1))
    done

    job_pool_wait

    local remaining_chunks=("$chunk_dir"/*.nq)
    local remaining_chunks_count=${#remaining_chunks[@]}

    log_message "INFO" "Chunk processing completed for namespace: $namespace"

    if [ $remaining_chunks_count -eq 0 ]; then
        log_message "INFO" "All chunks processed successfully."
        return 0
    else
        log_message "ERROR" "Some chunks were not processed. Remaining chunks: $remaining_chunks_count"
        return 1
    fi
}

. job_pool.sh

job_pool_init 10 0

chunk_size=100000
target_folders=($(find_target_folders))

if [ ${#target_folders[@]} -eq 0 ]; then
    log_message "ERROR" "No target folders found (dkg or paranet*)"
    exit 1
fi

log_message "INFO" "Found ${#target_folders[@]} target folders: ${target_folders[*]}"

for folder in "${target_folders[@]}"; do
    log_message "INFO" "Processing folder: $folder"
    if [ ! -f "$folder/$folder/data.nq.gz" ]; then
        log_message "ERROR" "Required file not found: $folder/$folder/data.nq.gz"
        continue
    fi

    if [ ! -d "$folder/chunks" ]; then
        split_into_chunks "$folder" "$chunk_size"
    else
        log_message "INFO" "Using existing chunks directory: $folder/chunks"
    fi

    process_chunks "$folder"
done

log_message "INFO" "Migration process completed"

job_pool_shutdown
