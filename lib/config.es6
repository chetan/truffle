var fs = require("fs");
var dir = require("node-dir");
var deasync = require("deasync");
var filesSync = deasync(dir.files);
var subdirSync = deasync(dir.subdirs);
var _ = require("lodash");
var Web3 = require("web3");
var loadconf = deasync(require("./loadconf"));
var path = require("path");
var Exec = require("./exec");
var ConfigurationError = require('./errors/configurationerror');
var Pudding = require("ether-pudding");
var PuddingLoader = require("ether-pudding/loader");

var Config = {
  gather(truffle_dir, working_dir, argv, desired_environment) {
    var config = {};
    config = _.merge(config, {
      argv: argv,
      truffle_dir: truffle_dir,
      working_dir: working_dir,
      web3: new Web3(),
      environments: {
        directory: `${working_dir}/config`,
        available: {},
        current: {}
      },
      app: {
        configfile: path.join(working_dir, "config", "app.json"),
        directory: path.join(working_dir, "app"),
        // Default config objects that'll be overwritten by working_dir config.
        resolved: {
          build: {},
          deploy: [],
          after_deploy: [],
          rpc: {},
          processors: {}
        }
      },
      frontend: {
        contract_inserter_filename: `${truffle_dir}/lib/insert_contracts.js`,
        includes: {
          bluebird: `${truffle_dir}/node_modules/bluebird/js/browser/bluebird.js`,
          web3: `${truffle_dir}/node_modules/web3/dist/web3.min.js`,
          pudding: `${truffle_dir}/node_modules/ether-pudding/build/ether-pudding.js`
        },
        includes_order: [
          "bluebird",
          "web3",
          "pudding"
        ]
      },
      example: {
        directory: `${truffle_dir}/example`,
        contract: {
          directory: `${truffle_dir}/example/contracts`,
          filename: `${truffle_dir}/example/contracts/Example.sol`,
          name: "Example",
          variable: "example"
        },
        test: {
          directory: path.join(truffle_dir, "example", "test"),
          filename: path.join(truffle_dir, "example", "test", "example.js")
        }
      },
      contracts: {
        classes: {},
        directory: `${working_dir}/contracts`
      },
      tests: {
        directory: `${working_dir}/test`
      },
      build: {
        directory: path.join(working_dir, "build"),
        defaults: {
          "post-process": {
            "app.js": [
              "bootstrap",
              "frontend-dependencies"
            ]
          }
        }
      },
      dist: {
        directory: `${working_dir}/dist`,
        defaults: {
          "post-process": {
            "app.js": [
              "bootstrap",
              "frontend-dependencies",
              "uglify"
            ]
          }
        }
      },
      processors: {
        // These processors do nothing, but are registered to reduce warnings.
        ".html": `${truffle_dir}/lib/processors/null.es6`,
        ".js": `${truffle_dir}/lib/processors/null.es6`,
        ".css": `${truffle_dir}/lib/processors/null.es6`,
        ".json": `${truffle_dir}/lib/processors/null.es6`,

        // Helpful default processors.
        ".coffee": `${truffle_dir}/lib/processors/coffee.es6`,
        ".scss": `${truffle_dir}/lib/processors/scss.es6`,

        // Babel-related processors.
        ".es6": `${truffle_dir}/lib/processors/babel.es6`,
        ".es": `${truffle_dir}/lib/processors/babel.es6`,
        ".jsx": `${truffle_dir}/lib/processors/babel.es6`,

        // Named processors for post-processing.
        "null": `${truffle_dir}/lib/processors/null.es6`, // does nothing; useful in some edge cases.
        "uglify": `${truffle_dir}/lib/processors/post/uglify.es6`,
        "frontend-dependencies": `${truffle_dir}/lib/processors/post/frontend_dependencies.es6`,
        "bootstrap": `${truffle_dir}/lib/processors/post/bootstrap.es6`,
        "include-contracts": `${truffle_dir}/lib/processors/post/include_contracts.es6`
      }
    });

    desired_environment = argv.e || argv.environment || process.env.NODE_ENV || desired_environment;

    // Try to find the desired environment, and fall back to development if we don't find it.
    for (var environment of [desired_environment, "development"]) {
      var environment_directory = `${config.environments.directory}/${environment}`;
      if (!fs.existsSync(environment_directory)) {
        continue;
      }

      // I put this warning here but now I'm not sure if I want it.
      if (environment != desired_environment && desired_environment != null) {
        console.log(`Warning: Couldn't find environment ${desired_environment}.`);
      }

      config.environment = desired_environment;
      config.environments.current.directory = environment_directory;
      config.environments.current.filename = path.join(environment_directory, "config.json");

      break;
    }

    // If we didn't find an environment, but asked for one, error.
    if (config.environment == null && desired_environment != null) {
      throw new ConfigurationError("Couldn't find any suitable environment. Check environment configuration.");
    }

    // Get environments in working directory, if available.
    if (fs.existsSync(config.environments.directory)) {
      for (var directory of subdirSync(config.environments.directory)) {
        name = directory.substring(directory.lastIndexOf("/") + 1)
        config.environments.available[name] = directory;
      }
    }

    // Load the app config.
    if (fs.existsSync(config.app.configfile)) {
      config.app.resolved = loadconf(config.app.configfile, config.app.resolved);
    }

    // Now overwrite any values from the environment config.
    if (fs.existsSync(config.environments.current.filename)) {
      config.app.resolved = loadconf(config.environments.current.filename, config.app.resolved);
    }

    // Allow for deprecated build configuration.
    if (config.app.resolved.frontend != null) {
      config.app.resolved.build = config.app.resolved.frontend;
    }

    // Helper function for expecting paths to exist.
    config.expect = function(expected_path, description="file", extra="", callback) {
      if (typeof description == "function") {
        callback = description;
        description = "file";
        extra = "";
      }

      if (typeof extra == "function") {
        callback = description;
        extra = "";
      }

      if (!fs.existsSync(expected_path)) {
        var display_path = expected_path.replace(this.working_dir, "./");
        var error = new ConfigurationError(`Couldn't find ${description} at ${display_path}. ${extra}`);

        if (callback != null) {
          callback(error);
          return false;
        } else {
          throw error;
        }
      }
      return true;
    };

    config.test_connection = function(callback) {
      config.web3.eth.getCoinbase(function(error, coinbase) {
        if (error != null) {
          error = new Error("Could not connect to your RPC client. Please check your RPC configuration.");
        }

        callback(error, coinbase)
      });
    };

    // Find the processors and then turn them into executable functions.
    for (var extension in config.processors) {
      var file = config.processors[extension];
      config.processors[extension] = require(file);
    }

    for (var extension in config.app.resolved.processors) {
      var file = config.app.resolved.processors[extension];
      var full_path = path.join(working_dir, file);
      extension = extension.toLowerCase();
      config.expect(full_path, `specified .${extension} processor`, "Check your app config.");
      config.processors[extension] = require(full_path);
    }

    // Evaluate build targets, making the configuration conform, adding
    // default post processing, if any.
    for (var target in config.app.resolved.build) {
      var options = config.app.resolved.build[target];
      if (typeof options == "string") options = [options];
      if (options instanceof Array) {
        options = {
          files: options,
          "post-process": {
            build: [],
            dist: []
          }
        }
      }

      if (options["post-process"] == null) {
        options["post-process"] = {build: [], dist: []};
      }

      // If an array was passed, use the same post processing in both contexts.
      if (options["post-process"] instanceof Array) {
        var new_post_process = {
          build: options["post-process"],
          dist: options["post-process"]
        }
        options["post-process"] = new_post_process;
      }

      // Check for default post processing for this target,
      // and add it if the target hasn't specified any post processing.
      var contexts = ["build", "dist"];
      for (var index in contexts) {
        var context = contexts[index];
        if (config[context].defaults["post-process"][target] != null && options["post-process"][context].length == 0) {
          options["post-process"][context] = config[context].defaults["post-process"][target];
        }
      }

      config.app.resolved.build[target] = options;
    }

    var provider = new Web3.providers.HttpProvider(`http://${config.app.resolved.rpc.host}:${config.app.resolved.rpc.port}`);
    config.web3.setProvider(provider);

    if (argv.verboseRpc != null) {
      // // If you want to see what web3 is sending and receiving.
      var oldAsync = config.web3.currentProvider.sendAsync;
      config.web3.currentProvider.sendAsync = function(options, callback) {
        console.log("   > " + JSON.stringify(options, null, 2).split("\n").join("\n   > "));
        oldAsync.call(config.web3.currentProvider, options, function(error, result) {
          if (error == null) {
            console.log(" <   " + JSON.stringify(result, null, 2).split("\n").join("\n <   "));
          }
          callback(error, result)
        });
      };
    }

    // Get contracts in working directory, if available.
    if (fs.existsSync(config.contracts.directory)) {
      for (file of filesSync(config.contracts.directory)) {
        var name = file.substring(file.lastIndexOf("/") + 1, file.lastIndexOf("."));
        var relative_path = file.replace(config.working_dir, "./");
        config.contracts.classes[name] = {
          source: relative_path
        }
      }
    }

    // Now merge those contracts with what's in the configuration, if any, using the loader.
    Pudding.setWeb3(config.web3);

    if (fs.existsSync(config.environments.current.directory)) {
      var loader = deasync(PuddingLoader.load);
      var contracts = {};

      var names = loader(config.environments.current.directory, Pudding, contracts);

      for (var name of names) {
        // Don't load a contract that's been deleted.
        if (!config.contracts.classes[name]) {
          continue;
        }

        var contract = contracts[name];
        config.contracts.classes[name].abi = contract.abi;
        config.contracts.classes[name].binary = contract.binary;
        config.contracts.classes[name].address = contract.address;
      }
    }

    return config;
  }
}

module.exports = Config;
