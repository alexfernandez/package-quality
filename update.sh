#!/bin/bash
# Update packages
HOME=/home/ubuntu
USER=ubuntu
DIR=$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )

cd $DIR/bin

sudo -u $USER node update.js >> $HOME/log/package-quality-update.log

