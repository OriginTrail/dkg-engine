#!/bin/bash
# Source bash profile to ensure PATH includes Homebrew
source ~/.bash_profile 2>/dev/null || true
pathToOtNode=$(pwd)
numberOfNodes=12
network="hardhat1:31337"
tripleStore="ot-blazegraph"
availableNetworks=("hardhat1:31337")
export $(xargs < $pathToOtNode/.env)
export ACCESS_KEY=$RPC_ENDPOINT
# Check for script arguments
while [ $# -gt 0 ]; do
  case "$1" in
  	# Override number of nodes if the argument is specified
    --nodes=*)
      numberOfNodes="${1#*=}"
      if [[ $numberOfNodes -le 0 ]]
      then
        echo Cannot run 0 nodes
        exit 1
      fi
      ;;
    # Print script usage if --help is given
    --help)
      echo "Use --nodes=<insert_number_here> to specify the number of nodes to generate"
      echo "Use --network=<insert_network_name> to specify the network to connect to. Available networks: hardhat, rinkeby. Default: hardhat"
      exit 0
      ;;
    --network=*)
      network="${1#*=}"
      if [[ ! " ${availableNetworks[@]} " =~ " ${network} " ]]
      then
          echo Invalid network parameter. Available networks: hardhat
          exit 1
      fi
      ;;
    --tripleStore=*)
      tripleStore="${1#*=}"
      ;;
    *)
      printf "***************************\n"
      printf "* Error: Invalid argument.*\n"
      printf "***************************\n"
      exit 1
  esac
  shift
done
if [[ $network == hardhat1:31337 ]]
then
  echo ================================
  echo ====== Starting hardhat1 ======
  echo ================================

  osascript -e "tell app \"Terminal\"
        do script \"cd $pathToOtNode
        node tools/local-network-setup/run-local-blockchain.js 8545 \"
    end tell"
  echo Waiting for hardhat to start and contracts deployment

  while ! nc -z localhost 8545; do
     sleep 1
  done

  echo Hardhat started.

  echo ================================
  echo ====== Starting hardhat 2 ======
  echo ================================

  osascript -e "tell app \"Terminal\"
        do script \"cd $pathToOtNode
        node tools/local-network-setup/run-local-blockchain.js 9545 \"
    end tell"
  echo Waiting for hardhat to start and contracts deployment

  while ! nc -z localhost 9545; do
     sleep 1
  done

  echo Hardhat started.
fi

echo ================================
echo ====== Generating configs ======
echo ================================

node $pathToOtNode/tools/local-network-setup/generate-config-files.js $numberOfNodes $network $tripleStore $hubContractAddress
sleep 30

echo ================================
echo ====== Clearing Redis ==========
echo ================================

# Clear all Redis data if redis-cli is available
if command -v redis-cli &> /dev/null; then
    redis-cli FLUSHALL
    echo Redis cleared.
elif [ -f "/opt/homebrew/bin/redis-cli" ]; then
    /opt/homebrew/bin/redis-cli FLUSHALL
    echo Redis cleared.
else
    echo "redis-cli not found. Skipping Redis cleanup."
    echo "To install Redis on macOS, run: brew install redis"
fi

echo ================================
echo ======== Starting nodes ========
echo ================================

startNode() {
  echo Starting node $1
  osascript -e "tell app \"Terminal\"
      do script \"cd $pathToOtNode
  node index.js ./tools/local-network-setup/.node$1_origintrail_noderc.json\"
  end tell"
}

i=0
while [[ $i -lt $numberOfNodes ]]
do
  startNode $i
  ((i = i + 1))
done
