#!/bin/bash
if [ -z "$TRUFFLE_WORKING_DIRECTORY" ];
then
  export TRUFFLE_WORKING_DIRECTORY=`pwd`
fi

if [ -z "$TRUFFLE_NPM_LOCATION" ];
then
  export TRUFFLE_NPM_LOCATION=$(dirname $(readlink -f $0))
fi

# Hack. babel-node will clobber -e, and it doesn't look like `--` will stop it.
# Because we're doing string replacement, we have to take edge cases into account.
args=" $@"
args=${args// -e / --environment }
args=${args// -e=/ --environment=}
args=${args// -environment/ --environment}

cd $TRUFFLE_NPM_LOCATION
if [[ -d $TRUFFLE_NPM_LOCATION/dist ]]; then
  exec node $TRUFFLE_NPM_LOCATION/dist/truffle.js exec ${args}
else
  exec $TRUFFLE_NPM_LOCATION/node_modules/.bin/babel-node -- $TRUFFLE_NPM_LOCATION/truffle.es6 exec ${args}
fi
