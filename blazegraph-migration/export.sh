#!/bin/bash

set -e

# Configs
BLAZEGRAPH_JAR="blazegraph.jar"

if [ "$#" -lt 2 ]; then
  echo "Usage: $0 <base_dir> <namespace1> [namespace2 ...]"
  exit 1
fi

BASE_DIR="$1"
shift

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

log "Stopping otnode service..."
sudo systemctl stop otnode.service

for NAMESPACE in "$@"; do
  FOLDER_NAME=$(echo "$NAMESPACE" | tr '-' '_')
  EXPORT_DIR="$BASE_DIR/$FOLDER_NAME"
  EXPORT_SUBFOLDER="$EXPORT_DIR/$FOLDER_NAME"
  EXPORT_FILE="$EXPORT_SUBFOLDER/data.nq.gz"
  QUAD_COUNT_FILE="OLD_QUAD_COUNT_${NAMESPACE}.txt"
  PROPERTIES_FILE="$EXPORT_DIR/${NAMESPACE}.properties"
  BLAZEGRAPH_URL="http://localhost:9999/blazegraph/namespace/$NAMESPACE/sparql"

  log "Processing namespace: $NAMESPACE"

  log "Querying quad count from Blazegraph..."
  QUAD_COUNT=$(curl -s -X POST "$BLAZEGRAPH_URL" \
    -H "Accept: text/tab-separated-values" \
    --data-urlencode 'query=SELECT (COUNT(*) AS ?total) WHERE { GRAPH ?g { ?s ?p ?o } }' \
    | tail -n 1)

  echo "$QUAD_COUNT" > "$QUAD_COUNT_FILE"
  log "Quad count: $QUAD_COUNT (saved to $QUAD_COUNT_FILE)"

  log "Stopping blazegraph service..."
  sudo systemctl stop blazegraph.service

  log "Creating properties file for $NAMESPACE..."
  mkdir -p "$EXPORT_DIR"
  cat > "$PROPERTIES_FILE" <<EOF
com.bigdata.namespace.${NAMESPACE}.spo.com.bigdata.btree.BTree.branchingFactor=1024
com.bigdata.rdf.store.AbstractTripleStore.textIndex=false
com.bigdata.rdf.store.AbstractTripleStore.justify=false
com.bigdata.rdf.store.AbstractTripleStore.statementIdentifiers=false
com.bigdata.rdf.store.AbstractTripleStore.axiomsClass=com.bigdata.rdf.axioms.NoAxioms
com.bigdata.rdf.sail.namespace=${NAMESPACE}
com.bigdata.rdf.store.AbstractTripleStore.quads=true
com.bigdata.namespace.${NAMESPACE}.lex.com.bigdata.btree.BTree.branchingFactor=400
com.bigdata.rdf.store.AbstractTripleStore.geoSpatial=false
com.bigdata.journal.Journal.groupCommit=false
com.bigdata.rdf.sail.isolatableIndices=false
com.bigdata.rdf.store.AbstractTripleStore.enableRawRecordsSupport=false
com.bigdata.rdf.store.AbstractTripleStore.Options.inlineTextLiterals=true
com.bigdata.rdf.store.AbstractTripleStore.Options.maxInlineTextLength=128
com.bigdata.rdf.store.AbstractTripleStore.Options.blobsThreshold=256
com.bigdata.journal.AbstractJournal.file=${BASE_DIR}/blazegraph.jnl
EOF

  log "Exporting KB to N-Quads..."
  java -Xmx6g -cp "$BLAZEGRAPH_JAR" \
    com.bigdata.rdf.sail.ExportKB \
    -outdir "$EXPORT_DIR" \
    -format N-Quads \
    "$PROPERTIES_FILE" "$NAMESPACE" > "$EXPORT_DIR/output.log" 2>&1

  log "Export complete. Output should be in $EXPORT_FILE"

  if [ ! -f "$EXPORT_FILE" ]; then
    log "Export file not found: $EXPORT_FILE"
    exit 1
  fi

  log "Validating line count..."
  LINE_COUNT=$(zcat "$EXPORT_FILE" | wc -l)

  if [ "$LINE_COUNT" -eq "$QUAD_COUNT" ]; then
    log "Line count matches quad count: $LINE_COUNT lines"
  else
    log "MISMATCH for $NAMESPACE: exported $LINE_COUNT lines, expected $QUAD_COUNT"
    exit 1
  fi

  log "Starting blazegraph service..."
  sudo systemctl start blazegraph.service
done

log "Stopping blazegraph service to remove old journal..."
sudo systemctl stop blazegraph.service

log "Removing old Blazegraph journal..."
rm -f "${BASE_DIR}/blazegraph.jnl"

log "Creating new journal on blazegraph start..."
sudo systemctl start blazegraph.service

log "Resetting triple log..."
REPO_PW=$(grep ^REPOSITORY_PASSWORD= "$BASE_DIR/current/.env" | cut -d '=' -f2)
mysql -u root -p"$REPO_PW" operationaldb -e "UPDATE triples_insert_count SET count = 0 WHERE id = 1;"

log "Starting otnode service..."
sudo systemctl start otnode.service

log "Migration completed for all namespaces."