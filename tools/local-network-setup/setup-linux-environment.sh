#!/bin/bash
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
      echo "Use --network=<insert_network_name> to specify the network to connect to. Available networks: hardhat."
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
  x-terminal-emulator -e "bash -c 'cd $pathToOtNode && node tools/local-network-setup/run-local-blockchain.js 8545; exec bash'" &
  echo Waiting for hardhat to start and contracts deployment

  while ! nc -z localhost 8545; do
     sleep 1
  done

  echo Hardhat started.

  echo ================================
  echo ====== Starting hardhat 2 ======
  echo ================================
  x-terminal-emulator -e "bash -c 'cd $pathToOtNode && node tools/local-network-setup/run-local-blockchain.js 9545; exec bash'" &
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
sleep 16
echo ================================
echo ======== Starting nodes ========
echo ================================

startNode() {
  echo Starting node $1
  x-terminal-emulator -e "bash -c 'cd $pathToOtNode && node --inspect index.js ./tools/local-network-setup/.node$1_origintrail_noderc.json; exec bash'" &
}

i=0
while [[ $i -lt $numberOfNodes ]]
do
  startNode $i
  ((i = i + 1))
done

# wait
# Close started background processes when done (https://stackoverflow.com/a/2173421)
# trap "trap - SIGTERM && kill -- -$$" SIGINT SIGTERM EXIT
