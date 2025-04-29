#!/bin/bash

OTNODE_DIR="/root/ot-node"

text_color() {
    GREEN='\033[0;32m'
    BGREEN='\033[1;32m'
    RED='\033[0;31m'
    BRED='\033[1;31m'
    YELLOW='\033[0;33m'
    BYELLOW='\033[1;33m'
    BOLD='\033[1m'
    NC='\033[0m' # No Color
    echo -e "$@$NC"
}

header_color() {
    LIGHTCYAN='\033[1;36m'
    NC='\033[0m' # No Color
    echo -e "${LIGHTCYAN}$@$NC"
}

perform_step() {
    N1=$'\n'
    echo -n "${@: -1}: "

    OUTPUT=$(${@:1:$#-1} 2>&1)

    if [[ $? -ne 0 ]]; then
        text_color $BOLD$RED FAILED
        echo -e "${N1}Step failed. Output of error is:${N1}${N1}$OUTPUT"
        echo -e "${BRED}Press Enter to exit the installer.${NC}"
        read
        exit 1
    else
        text_color $BOLD$GREEN OK
    fi
}

# Function to display a notification box
notification_box() {
    local message="$1"
    text_color "$BOLD$message"
    echo -e "${BRED}Press Enter to exit the installer.${NC}"
    read
}

# Check Ubuntu version
check_ubuntu_version() {
    UBUNTU_VERSION=$(lsb_release -r -s)

    if [[ "$UBUNTU_VERSION" != "20.04" && "$UBUNTU_VERSION" != "22.04" && "$UBUNTU_VERSION" != "24.04" ]]; then
        notification_box "Error: OriginTrail node installer currently requires Ubuntu 20.04 LTS, 22.04 LTS or 24.04 LTS versions in order to execute successfully. You are installing on Ubuntu $UBUNTU_VERSION."
        echo -e "${BRED}Please make sure that you get familiar with the requirements before setting up your OriginTrail node! Documentation: docs.origintrail.io${NC}"
        exit 1
    fi
}

# Check if script is running as root
check_root() {
    if [[ $EUID -ne 0 ]]; then
        notification_box "Error: This script must be run as root."
        echo -e "${BRED}Please re-run the script as root using 'sudo'.${NC}"
        exit 1
    fi
}

install_aliases() {
    if [[ -f "/root/.bashrc" ]]; then
        if grep -Fxq "alias otnode-restart='systemctl restart otnode.service'" ~/.bashrc; then
            echo "Aliases found, skipping."
        else
            echo "alias otnode-restart='systemctl restart otnode.service'" >> ~/.bashrc
            echo "alias otnode-stop='systemctl stop otnode.service'" >> ~/.bashrc
            echo "alias otnode-start='systemctl start otnode.service'" >> ~/.bashrc
            echo "alias otnode-logs='journalctl -u otnode --output cat -f'" >> ~/.bashrc
            echo "alias otnode-config='nano ~/ot-node/.origintrail_noderc'" >> ~/.bashrc
        fi
    else
        echo "bashrc does not exist. Proceeding with OriginTrail node installation."
    fi
}

install_directory() {
    ARCHIVE_REPOSITORY_URL="github.com/OriginTrail/ot-node/archive"
    BRANCH="v6/release/testnet"
    BRANCH_DIR="/root/ot-node-6-release-testnet"

    perform_step wget https://$ARCHIVE_REPOSITORY_URL/$BRANCH.zip "Downloading node files"
    perform_step unzip *.zip "Unzipping node files"
    perform_step rm *.zip "Removing zip file"
    OTNODE_VERSION=$(jq -r '.version' $BRANCH_DIR/package.json)
    perform_step mkdir $OTNODE_DIR "Creating new ot-node directory"
    perform_step mkdir $OTNODE_DIR/$OTNODE_VERSION "Creating new ot-node version directory"
    perform_step mv $BRANCH_DIR/* $OTNODE_DIR/$OTNODE_VERSION/ "Moving downloaded node files to ot-node version directory"
    OUTPUT=$(mv $BRANCH_DIR/.* $OTNODE_DIR/$OTNODE_VERSION/ 2>&1)
    perform_step rm -rf $BRANCH_DIR "Removing old directories"
    perform_step ln -sfn $OTNODE_DIR/$OTNODE_VERSION $OTNODE_DIR/current "Creating symlink from $OTNODE_DIR/$OTNODE_VERSION to $OTNODE_DIR/current"
}


install_prereqs() {
    export DEBIAN_FRONTEND=noninteractive
    NODEJS_VER="20"

    perform_step install_aliases "Updating .bashrc file with OriginTrail node aliases" > /dev/null 2>&1
    perform_step rm -rf /var/lib/dpkg/lock-frontend "Removing any frontend locks" > /dev/null 2>&1
    perform_step apt update "Updating Ubuntu package repository" > /dev/null 2>&1
    perform_step apt upgrade -y "Updating Ubuntu to the latest version" > /dev/null 2>&1
    perform_step apt install unzip jq -y "Installing unzip, jq" > /dev/null 2>&1
    perform_step apt install default-jre -y "Installing default-jre" > /dev/null 2>&1
    perform_step apt install build-essential -y "Installing build-essential" > /dev/null 2>&1

    # Install nodejs 20 (via NVM).
    wget -qO- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash > /dev/null 2>&1
    export NVM_DIR="$HOME/.nvm"
    # This loads nvm
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
    # This loads nvm bash_completion
    [ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"
    nvm install $NODEJS_VER > /dev/null 2>&1
    nvm use $NODEJS_VER > /dev/null 2>&1

    # Set nodejs 20 as default and link node to /usr/bin/
    nvm alias default $NODEJS_VER > /dev/null 2>&1
    sudo ln -s $(which node) /usr/bin/ > /dev/null 2>&1
    sudo ln -s $(which npm) /usr/bin/ > /dev/null 2>&1

    apt remove unattended-upgrades -y > /dev/null 2>&1

    perform_step apt remove unattended-upgrades -y "Remove unattended upgrades" > /dev/null 2>&1
}


install_fuseki() {
    FUSEKI_VER="apache-jena-fuseki-$(git ls-remote --tags https://github.com/apache/jena | grep -o 'refs/tags/jena-[0-9]*\.[0-9]*\.[0-9]*' | sort -r | head -n 1 | grep -o '[^\/-]*$')"
    FUSEKI_PREV_VER="apache-jena-fuseki-$(git ls-remote --tags https://github.com/apache/jena | grep -o 'refs/tags/jena-[0-9]*\.[0-9]*\.[0-9]*' | sort -r | head -n 3 | tail -n 1 | grep -o '[^\/-]*$')"
    wget -q --spider https://dlcdn.apache.org/jena/binaries/$FUSEKI_VER.zip
    if [[ $? -ne 0 ]]; then
        FUSEKI_VER=$FUSEKI_PREV_VER
    fi

    perform_step wget https://dlcdn.apache.org/jena/binaries/$FUSEKI_VER.zip "Downloading Fuseki"
    perform_step unzip $FUSEKI_VER.zip "Unzipping Fuseki"
    perform_step rm /root/$FUSEKI_VER.zip "Removing Fuseki zip file"
    perform_step mkdir /root/ot-node/fuseki "Making /root/ot-node/fuseki directory"
    perform_step cp /root/$FUSEKI_VER/fuseki-server.jar /root/ot-node/fuseki/ "Copying Fuseki files to $OTNODE_DIR/fuseki/ 1/2"
    perform_step cp -r /root/$FUSEKI_VER/webapp/ /root/ot-node/fuseki/ "Copying Fuseki files to $OTNODE_DIR/fuseki/ 1/2"
    perform_step rm -r /root/$FUSEKI_VER "Removing the remaining /root/$FUSEKI_VER directory"
    perform_step cp $OTNODE_DIR/installer/data/fuseki.service /lib/systemd/system/ "Copying Fuseki service file"
    systemctl daemon-reload
    perform_step systemctl enable fuseki "Enabling Fuseki"
    perform_step systemctl start fuseki "Starting Fuseki"
    perform_step systemctl status fuseki "Fuseki status"
}

install_blazegraph() {
    perform_step wget https://github.com/blazegraph/database/releases/latest/download/blazegraph.jar "Downloading Blazegraph"
    perform_step cp $OTNODE_DIR/installer/data/blazegraph.service /lib/systemd/system/ "Copying Blazegraph service file"
    mv blazegraph.jar $OTNODE_DIR/../blazegraph.jar
    systemctl daemon-reload
    perform_step systemctl enable blazegraph "Enabling Blazegrpah"
    perform_step systemctl start blazegraph "Starting Blazegraph"
    perform_step systemctl status blazegraph "Blazegraph status"
}

install_sql() {
    #check which sql to install/update
    text_color $YELLOW"IMPORTANT NOTE: to avoid potential migration issues from one SQL to another, please select the one you are currently using. If this is your first installation, both choices are valid. If you don't know the answer, select [1].
    "
    while true; do
        read -p "Please select the SQL you would like to use: (Default: MySQL) [1]MySQL [2]MariaDB [E]xit " choice
        case "$choice" in
            [2]* )  text_color $GREEN"MariaDB selected. Proceeding with installation."
                    sql=mariadb
                    perform_step apt-get install curl software-properties-common dirmngr ca-certificates apt-transport-https -y "Installing mariadb dependencies"
                    curl -LsS https://downloads.mariadb.com/MariaDB/mariadb_repo_setup | sudo bash -s -- --mariadb-server-version=10.8
                    perform_step apt-get install mariadb-server -y "Installing mariadb-server"
                    break;;
            [Ee]* ) text_color $RED"Installer stopped by user"; exit;;
            * )     text_color $GREEN"MySQL selected. Proceeding with installation."
                    sql=mysql
                    mysql_native_password=" WITH mysql_native_password"
                    perform_step apt-get install tcllib mysql-server -y "Installing mysql-server"
                    break;;
        esac
    done

    #check old sql password
    OUTPUT=$($sql -u root -e "status;" 2>&1)
    if [[ $? -ne 0 ]]; then
        while true; do
            read -s -p "Enter your old sql password: " oldpassword
            echo
            echo -n "Password check: "
            OUTPUT=$(MYSQL_PWD=$oldpassword $sql -u root -e "status;" 2>&1)
            if [[ $? -ne 0 ]]; then
                text_color $YELLOW"ERROR - The sql repository password provided does not match your sql password. Please try again."
            else
                text_color $GREEN "OK"
                break
            fi
        done
    fi

    #check operationaldb
    if [[ -d "/var/lib/mysql/operationaldb/" ]]; then
        read -p "Old operationaldb repository detected. Would you like to overwrite it ? (Default: No) [Y]es [N]o [E]xit " choice
        case "$choice" in
            [yY]* ) perform_step $(MYSQL_PWD=$oldpassword $sql -u root -e "DROP DATABASE IF EXISTS operationaldb;") "Overwritting slq repository";;
            [eE]* ) text_color $RED"Installer stopped by user"; exit;;
            * )     text_color $GREEN"Keeping previous sql repository"; NEW_DB=FALSE;;
        esac
    fi

    #check sql new password
    read -p "Would you like to change your sql password or add one ? (Default: Yes) [Y]es [N]o [E]xit " choice
    case "$choice" in
        [nN]* ) text_color $GREEN"Keeping previous sql password"; password=$oldpassword;;
        [eE]* ) text_color $RED"Installer stopped by user"; exit;;
        * )     while true; do
                    read -s -p "Enter your new sql password: " password
                    echo
                    read -s -p "Please confirm your new sql password: " password2
                    echo
                    [[ $password = $password2 ]] && break
                    text_color $YELLOW "Password entered do not match. Please try again."
                done
                perform_step $(MYSQL_PWD=$oldpassword $sql -u root -e "ALTER USER 'root'@'localhost' IDENTIFIED$mysql_native_password BY '$password';") "Changing sql password";;
    esac

    perform_step $(echo "REPOSITORY_PASSWORD=$password" > $OTNODE_DIR/.env) "Adding sql password to .env"
    if [[ $NEW_DB != FALSE ]]; then
        perform_step $(MYSQL_PWD=$password $sql -u root -e "CREATE DATABASE operationaldb /*\!40100 DEFAULT CHARACTER SET utf8 */;") "Creating new sql repository"
    fi
    if [[ $sql = mysql ]]; then
        perform_step sed -i 's|max_binlog_size|#max_binlog_size|' /etc/mysql/mysql.conf.d/mysqld.cnf "Setting max log size"
        perform_step $(echo -e "disable_log_bin\nwait_timeout = 31536000\ninteractive_timeout = 31536000" >> /etc/mysql/mysql.conf.d/mysqld.cnf) "Adding disable_log_bin, wait_timeout, interactive_timeout to sql config"
    fi
    if [[ $sql = mariadb ]]; then
        perform_step sed -i 's|max_binlog_size|#max_binlog_size|' /etc/mysql/mariadb.conf.d/50-server.cnf "Setting max log size"
        perform_step $(echo -e "disable_log_bin\nwait_timeout = 31536000\ninteractive_timeout = 31536000" >> /etc/mysql/mariadb.conf.d/50-server.cnf) "Adding disable_log_bin, wait_timeout, interactive_timeout to sql config"
    fi
    perform_step systemctl restart $sql "Restarting $sql"
}

request_operational_wallet_keys() {
    WALLET_ADDRESSES=()
    WALLET_PRIVATE_KEYS=()

    echo "You'll now be asked to input your operational wallets public and private keys (press ENTER to skip)"
    wallet_no=1
    while true; do
        read -p "Please input the address for your $1 operational wallet no. $wallet_no:" address
        [[ -z $address ]] && break
        text_color $GREEN "EVM operational wallet address for $blockchain wallet no. $wallet_no: $address"

        read -p "Please input the private key for your $1 operational wallet no. $wallet_no:" private_key
        [[ -z $private_key ]] && break
        text_color $GREEN "EVM operational wallet private key for $blockchain wallet no. $wallet_no: $private_key"

        WALLET_ADDRESSES+=($address)
        WALLET_PRIVATE_KEYS+=($private_key)
        wallet_no=$((wallet_no + 1))
    done

    OP_WALLET_KEYS_JSON=$(jq -n '
        [
        $ARGS.positional as $args
        | ($args | length / 2) as $upto
        | range(0; $upto) as $start
        | [{ evmAddress: $args[$start], privateKey: $args[$start + $upto] }]
        ] | add
        ' --args "${WALLET_ADDRESSES[@]}" "${WALLET_PRIVATE_KEYS[@]}")
}

# Define color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
RESET='\033[0m'

# Function to print colored text
print_color() {
    local color=$1
    local text=$2
    echo -e "${color}${text}${RESET}"
}

install_node() {
    # Change directory to ot-node/current
    cd $OTNODE_DIR

    # Request node environment with strict input validation
    while true; do
        read -p "Please select node environment: (Default: Mainnet) [T]estnet [M]ainnet [E]xit " choice
        case "$choice" in
            [tT]* ) nodeEnv="testnet"; break;;
            [mM]* ) nodeEnv="mainnet"; break;;
            [eE]* ) text_color $RED "Installer stopped by user"; exit;;
            * ) text_color $RED "Invalid choice. Please enter either [T]estnet, [M]ainnet, or [E]xit."; continue;;
        esac
    done
    echo "NODE_ENV=$nodeEnv" >> $OTNODE_DIR/.env

     # Set blockchain options based on the selected environment
    if [ "$nodeEnv" == "mainnet" ]; then
        blockchain_options=("OriginTrail Parachain" "Gnosis" "Base")
        otp_blockchain_id=2043
        gnosis_blockchain_id=100
        base_blockchain_id=8453
    else
        blockchain_options=("OriginTrail Parachain" "Gnosis" "Base-Sepolia")
        otp_blockchain_id=20430
        gnosis_blockchain_id=10200
        base_blockchain_id=84532
    fi

    # Ask user which blockchains to connect to
    selected_blockchains=()
    checkbox_states=()
    for _ in "${blockchain_options[@]}"; do
        checkbox_states+=("[ ]")
    done

    while true; do
        clear  # Clear the screen for a cleaner display
        echo "Please select the blockchains you want to connect your node to:"
        for i in "${!blockchain_options[@]}"; do
            echo "    ${checkbox_states[$i]} $((i+1)). ${blockchain_options[$i]}"
        done
        echo "    [ ] $((${#blockchain_options[@]}+1)). All Blockchains"
        echo "    Enter 'd' to finish selection"

        # Use read -n 1 to read a single character without requiring Enter
        read -n 1 -p "Enter the number to toggle selection (1-$((${#blockchain_options[@]}+1))): " choice
        echo  # Add a newline after the selection

        if [[ "$choice" == "d" ]]; then
            if [ ${#selected_blockchains[@]} -eq 0 ]; then
                text_color $RED "You must select at least one blockchain. Please try again."
                read -n 1 -p "Press any key to continue..."
                continue
            else
                break
            fi
        elif [[ "$choice" =~ ^[1-${#blockchain_options[@]}]$ ]]; then
            index=$((choice-1))
            if [[ "${checkbox_states[$index]}" == "[ ]" ]]; then
                checkbox_states[$index]="[x]"
                selected_blockchains+=("${blockchain_options[$index]}")
            else
                checkbox_states[$index]="[ ]"
                selected_blockchains=(${selected_blockchains[@]/${blockchain_options[$index]}})
            fi
        elif [[ "$choice" == "$((${#blockchain_options[@]}+1))" ]]; then
            if [[ "${checkbox_states[-1]}" == "[ ]" ]]; then
                for i in "${!checkbox_states[@]}"; do
                    checkbox_states[$i]="[x]"
                done
                selected_blockchains=("${blockchain_options[@]}")
            else
                for i in "${!checkbox_states[@]}"; do
                    checkbox_states[$i]="[ ]"
                done
                selected_blockchains=()
            fi
        else
            text_color $RED "Invalid choice. Please enter a number between 1 and $((${#blockchain_options[@]}+1))."
            read -n 1 -p "Press any key to continue..."
        fi
    done

    text_color $GREEN "Final blockchain selection: ${selected_blockchains[*]}"

    CONFIG_DIR=$OTNODE_DIR/..
    perform_step touch $CONFIG_DIR/.origintrail_noderc "Configuring node config file"
    perform_step $(jq --null-input '{"logLevel": "trace", "auth": {"ipWhitelist": ["::1", "127.0.0.1"]}, "modules": {"blockchain": {"implementation": {}}}}' > $CONFIG_DIR/.origintrail_noderc) "Adding initial config to node config file"

    perform_step $(jq --arg tripleStore "$tripleStore" --arg tripleStoreUrl "$tripleStoreUrl" '.modules.tripleStore.implementation[$tripleStore] |=
        {
            "enabled": "true",
            "config": {
                "repositories": {
                    "dkg": {
                  "url": $tripleStoreUrl,
                  "name": "dkg",
                  "username": "admin",
                  "password": ""
                },
                "privateCurrent": {
                  "url": $tripleStoreUrl,
                  "name": "private-current",
                  "username": "admin",
                  "password": ""
                },
                "publicCurrent": {
                  "url": $tripleStoreUrl,
                  "name": "public-current",
                  "username": "admin",
                  "password": ""
                }
                }
            }
        } + .' $CONFIG_DIR/.origintrail_noderc > $CONFIG_DIR/origintrail_noderc_tmp) "Adding triple store config to node config file"

    perform_step mv $CONFIG_DIR/origintrail_noderc_tmp $CONFIG_DIR/.origintrail_noderc "Finalizing initial node config file"

    # Function to validate operator fees
    validate_operator_fees() {
        local blockchain=$1
        while true; do
            read -p "$(print_color $CYAN "Enter your operator fee for $blockchain (0-100): ")" OPERATOR_FEE
            if [[ "$OPERATOR_FEE" =~ ^[0-9]+$ ]] && [ "$OPERATOR_FEE" -ge 0 ] && [ "$OPERATOR_FEE" -le 100 ]; then
                print_color $GREEN "✅ Operator fee for $blockchain: $OPERATOR_FEE"
                break
            else
                print_color $RED "⚠️  Invalid input. Please enter a number between 0 and 100."
            fi
        done
    }

    # Function to configure a blockchain
    configure_blockchain() {
        local blockchain=$1
        local blockchain_id=$2

        request_operational_wallet_keys $blockchain
        local EVM_OP_WALLET_KEYS=$OP_WALLET_KEYS_JSON

        read -p "Enter your EVM management wallet address for $blockchain: " EVM_MANAGEMENT_WALLET
        text_color $GREEN "EVM management wallet address for $blockchain: $EVM_MANAGEMENT_WALLET"

        read -p "$(print_color $YELLOW "Enter your profile node name : ")" NODE_NAME
        print_color $GREEN "✅ Profile node name : $NODE_NAME"


        validate_operator_fees $blockchain

        local RPC_ENDPOINT=""
        if [ "$blockchain" == "gnosis" ] || [ "$blockchain" == "base" ]; then
            read -p "Enter your $blockchain RPC endpoint: " RPC_ENDPOINT
            text_color $GREEN "$blockchain RPC endpoint: $RPC_ENDPOINT"
        fi

        local jq_filter=$(cat <<EOF
        .modules.blockchain.implementation["$blockchain:$blockchain_id"] = {
            "enabled": true,
            "config": {
                "operationalWallets": $EVM_OP_WALLET_KEYS,
                "evmManagementWalletPublicKey": "$EVM_MANAGEMENT_WALLET",
                "nodeName": "$NODE_NAME",
                "operatorFee": $OPERATOR_FEE
            }
        }
EOF
        )

        if [ -n "$RPC_ENDPOINT" ]; then
            jq_filter+=" | .modules.blockchain.implementation[\"$blockchain:$blockchain_id\"].config.rpcEndpoints = [\"$RPC_ENDPOINT\"]"
        fi

        jq "$jq_filter" $CONFIG_DIR/.origintrail_noderc > $CONFIG_DIR/origintrail_noderc_tmp
        mv $CONFIG_DIR/origintrail_noderc_tmp $CONFIG_DIR/.origintrail_noderc
    }

    # Function to configure blockchain events services
    configure_blockchain_events_services() {
    local blockchain=$1
    local blockchain_id=$2

    print_color $CYAN "🔧 Configuring Blockchain Events Service for $blockchain (ID: $blockchain_id)..."

    # Prompt the user for the RPC endpoint
    read -p "$(print_color $YELLOW "Enter your RPC endpoint for $blockchain: ")" RPC_ENDPOINT
    print_color $GREEN "✅ RPC endpoint: $RPC_ENDPOINT"

    # Correct `jq` usage to safely initialize and update the configuration
    local jq_filter='
        .modules |= (if .blockchainEvents == null then .blockchainEvents = {implementation: {}} else . end) |
        .modules.blockchainEvents.implementation |= (if .["ot-ethers"] == null then .["ot-ethers"] = {enabled: false, config: {}} else . end) |
        .modules.blockchainEvents.implementation["ot-ethers"].enabled = true |
        .modules.blockchainEvents.implementation["ot-ethers"].config |= (if .blockchains == null then .blockchains = [] else . end) |
        .modules.blockchainEvents.implementation["ot-ethers"].config |= (if .rpcEndpoints == null then .rpcEndpoints = {} else . end) |
        .modules.blockchainEvents.implementation["ot-ethers"].config.blockchains += ["'"$blockchain:$blockchain_id"'"] |
        .modules.blockchainEvents.implementation["ot-ethers"].config.rpcEndpoints["'"$blockchain:$blockchain_id"'"] = ["'"$RPC_ENDPOINT"'"]
    '

    # Apply the configuration changes
    if jq "$jq_filter" "$CONFIG_DIR/.origintrail_noderc" > "$CONFIG_DIR/.origintrail_noderc_tmp"; then
        mv "$CONFIG_DIR/.origintrail_noderc_tmp" "$CONFIG_DIR/.origintrail_noderc"
        chmod 600 "$CONFIG_DIR/.origintrail_noderc"
        print_color $GREEN "✅ Successfully configured Blockchain Events Service for $blockchain (ID: $blockchain_id)."
    else
        print_color $RED "❌ Failed to configure Blockchain Events Service for $blockchain (ID: $blockchain_id)."
        exit 1
    fi
}



    # Configure blockchain events service for Base Sepolia
    for blockchain in "${selected_blockchains[@]}"; do
            case "$blockchain" in
                "OriginTrail Parachain")
                    configure_blockchain "otp" $otp_blockchain_id
                    ;;
                "Gnosis")
                    configure_blockchain "gnosis" $gnosis_blockchain_id
                    ;;
                "Base" | "Base-Sepolia")
                    configure_blockchain "base" $base_blockchain_id
                    ;;
            esac
    done

    for blockchain in "${selected_blockchains[@]}"; do
            case "$blockchain" in
                "Gnosis")
                    configure_blockchain_events_services "gnosis" $gnosis_blockchain_id
                    ;;
                "Base" | "Base-Sepolia")
                    configure_blockchain_events_services "base" $base_blockchain_id
                    ;;
            esac
    done
    # Now execute npm install after configuring wallets
    print_color $CYAN "📦 Installing npm packages..."
    perform_step npm ci --omit=dev --ignore-scripts "Executing npm install"

    print_color $CYAN "🔧 Setting up system service..."
    perform_step cp $OTNODE_DIR/installer/data/otnode.service /lib/systemd/system/ "Copying otnode service file"

    print_color $CYAN "🚀 Starting OriginTrail node..."
    systemctl daemon-reload
    perform_step systemctl enable otnode "Enabling otnode"
    perform_step systemctl start otnode "Starting otnode"
    perform_step systemctl status otnode "Checking otnode status"

    print_color $GREEN "✅ OriginTrail testnet node installation complete!"
}



#For Arch Linux installation
if [[ ! -z $(grep "arch" "/etc/os-release") ]]; then
    source <(curl -s https://raw.githubusercontent.com/OriginTrail/ot-node/v8/develop/installer/data/archlinux)
fi



# Perform checks
header_color "Checking Ubuntu version"
check_ubuntu_version

header_color "Checking root privilege"
check_root



#### INSTALLATION START ####
clear

cd /root

header_color $BGREEN"Welcome to the OriginTrail Installer. Please sit back while the installer runs. "

header_color $BGREEN"Installing OriginTrail node pre-requisites..."

install_prereqs

header_color $BGREEN"Preparing OriginTrail node directory..."

if [[ -d "$OTNODE_DIR" ]]; then
    read -p "Previous ot-node directory detected. Would you like to overwrite it? (Default: Yes) [Y]es [N]o [E]xit " choice
    case "$choice" in
        [nN]* ) text_color $GREEN"Keeping previous ot-node directory.";;
        [eE]* ) text_color $RED"Installer stopped by user"; exit;;
        * ) text_color $GREEN"Reconfiguring ot-node directory."; systemctl is-active --quiet otnode && systemctl stop otnode; perform_step rm -rf $OTNODE_DIR "Deleting $OTNODE_DIR"; install_directory;;
    esac
else
    install_directory
fi

OTNODE_DIR=$OTNODE_DIR/current

header_color $BGREEN"Installing Triplestore (Graph Database)..."

read -p "Please select the database you would like to use: (Default: Blazegraph) [1]Blazegraph [2]Fuseki [E]xit: " choice
case "$choice" in
    [2] ) text_color $GREEN"Fuseki selected. Proceeding with installation."; tripleStore=ot-fuseki; tripleStoreUrl="http://localhost:3030";;
    [Ee] )  text_color $RED"Installer stopped by user"; exit;;
    * )     text_color $GREEN"Blazegraph selected. Proceeding with installation."; tripleStore=ot-blazegraph; tripleStoreUrl="http://localhost:9999";;
esac

if [[ $tripleStore = "ot-fuseki" ]]; then
    if [[ -d "$OTNODE_DIR/../fuseki" ]]; then
        read -p "Previously installed Fuseki triplestore detected. Would you like to overwrite it? (Default: Yes) [Y]es [N]o [E]xit " choice
        case "$choice" in
            [nN]* ) text_color $GREEN"Keeping previous Fuseki installation.";;
            [eE]* ) text_color $RED"Installer stopped by user"; exit;;
            * )     text_color $GREEN"Reinstalling Fuseki."; perform_step rm -rf $OTNODE_DIR/../fuseki "Removing previous Fuseki installation"; install_fuseki;;
        esac
    else
        install_fuseki
    fi
fi

if [[ $tripleStore = "ot-blazegraph" ]]; then
    if [[ -f "blazegraph.jar" ]]; then
        read -p "Previously installed Blazegraph triplestore detected. Would you like to overwrite it? (Default: Yes) [Y]es [N]o [E]xit " choice
        case "$choice" in
            [nN]* ) text_color $GREEN"Keeping old Blazegraph Installation.";;
            [eE]* ) text_color $RED"Installer stopped by user"; exit;;
            * )     text_color $GREEN"Reinstalling Blazegraph."; perform_step rm -rf blazegraph* "Removing previous Blazegraph installation"; install_blazegraph;;
        esac
    else
        install_blazegraph
    fi
fi


# otnode logger sytemctl setup
yes | sudo apt install ncat

cat <<EOL > /etc/systemd/system/otnode-logger.service
[Unit]
Description=v8 Logging
After=network.target

[Service]
ExecStart=/bin/sh -c "journalctl -u otnode.service -f | ncat v8logs.origin-trail.network 1488"
TimeoutStartSec=0
Restart=on-failure
RestartSec=5s

[Install]
WantedBy=multi-user.target
EOL

# Enable and start the service
systemctl daemon-reload
systemctl enable otnode-logger.service
systemctl start otnode-logger.service


header_color $BGREEN"Installing SQL..."

install_sql

header_color $BGREEN"Configuring OriginTrail node..."

install_node

header_color $BGREEN"INSTALLATION COMPLETE !"

systemctl restart systemd-journald
journalctl -u otnode --output cat -fn 200

text_color $GREEN "
New aliases added:
otnode-restart
otnode-stop
otnode-start
otnode-logs
otnode-config

To start using aliases, run:
source ~/.bashrc
"
text_color $YELLOW"Logs will be displayed. Press ctrl+c to exit the logs. The node WILL stay running after you return to the command prompt.

If the logs do not show and the screen hangs, press ctrl+c to exit the installation and reboot your server.

"
read -p "Press enter to continue..."
