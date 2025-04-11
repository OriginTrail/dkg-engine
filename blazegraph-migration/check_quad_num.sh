#!/bin/bash

get_mysql_password() {
    local base_dir=$(dirname "$0")
    grep ^REPOSITORY_PASSWORD= "$base_dir/current/.env" | cut -d '=' -f2
}

get_inserted_triples_count() {
    local repo_pw=$1
    mysql -u root -p"$repo_pw" operationaldb -e "SELECT count FROM triples_insert_count WHERE id = 1;" | tail -n 1
}

get_blazegraph_count() {
    local namespace=$1
    local BLAZEGRAPH_URL="http://localhost:9999/blazegraph/namespace/$namespace/sparql"
    QUAD_COUNT=$(curl -s -X POST "$BLAZEGRAPH_URL" \
      -H "Accept: text/tab-separated-values" \
      --data-urlencode 'query=SELECT (COUNT(*) AS ?total) WHERE { GRAPH ?g { ?s ?p ?o } }' \
      | tail -n 1)
    
    if ! [[ "$QUAD_COUNT" =~ ^[0-9]+$ ]]; then
        echo "Error: Failed to get valid count from Blazegraph" >&2
        return 1
    fi
    
    echo "$QUAD_COUNT"
    return 0
}

get_old_count() {
    local old_count_file=$1
    if [ ! -f "$old_count_file" ]; then
        echo "Error: $old_count_file not found" >&2
        return 1
    fi
    cat "$old_count_file"
}

get_uninserted_count() {
    local namespace=$1
    local chunks_dir="${namespace}/chunks"
    
    if [ ! -d "$chunks_dir" ]; then
        echo "Error: Chunks directory not found at $chunks_dir" >&2
        return 1
    fi
    
    local total_lines=0
    for chunk_file in "$chunks_dir"/chunk*; do
        if [ -f "$chunk_file" ]; then
            local lines=$(wc -l < "$chunk_file")
            total_lines=$((total_lines + lines))
        fi
    done
    
    echo "$total_lines"
    return 0
}

check_quad_count() {
    local namespace=$1
    local old_count_file="OLD_QUAD_COUNT_${namespace}.txt"
    
    local old_count=$(get_old_count "$old_count_file") || return 1
    local repo_pw=$(get_mysql_password)
    local current_count=$(get_blazegraph_count "$namespace")
    local inserted_triples=$(get_inserted_triples_count "$repo_pw")
    
    local uninserted_count=0
    if uninserted=$(get_uninserted_count "$namespace"); then
        uninserted_count=$uninserted
        echo "[WARN] There are ${uninserted_count#-} uninserted quads in the chunks folder."
        echo "Feel free to run the import.sh script again."
        echo "*Note: Some chunks may need to be manually imported"
    fi
    
    local actual_count=$((current_count - inserted_triples + uninserted_count))
    local expected_total=$((old_count))
    
    if [ "$expected_total" -eq "$actual_count" ]; then
        if [ $uninserted_count -eq 0 ]; then
            echo "[SUCCESS] The migration has been completed successfully! There are no uninserted quads."
        else
            echo "[SUCCESS] The migration has been completed successfully thus far."
        fi
        return 0
    else
        local difference=$((actual_count - expected_total))
        if [ $difference -gt 0 ]; then
            echo "[ERROR] There are $difference more quads than expected"
            echo "*Note: Errors can happen during importing, if this number is of a small value, it can be ingored"
        else
            echo "[ERROR] There are ${difference#-} fewer quads than expected"
            echo "*Note: Errors can happen during importing, if this number is of a small value, it can be ingored"
        fi
        return 1
    fi
}

check_quad_count "dkg"
