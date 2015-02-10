#!/bin/bash
# Download a fresh copy of all.json
# (C) 2015 Alex Fernández
DIR=$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )
wget http://registry.npmjs.org/-/all -O $DIR/all.json

