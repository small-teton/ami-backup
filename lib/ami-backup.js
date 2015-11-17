var AWS = require('aws-sdk');
var async = require('async');
var config = require('config').config;
var program = require('commander');
var winston = require('winston');
var path = require('path');
var fs = require('fs');
var Invalidate = require('./invalidate');
var Preserve = require('./preserve');

program.version('1.0.0')
.arguments('<cmd> [option]')
.usage('node-amiroteto [command] [options]')
.option('-p, --profile [PROFILE]', '# Load credentials by profile name from shared credentials file.')
.option('-k, --access-key-id [ACCESS_KEY_ID]', '# AWS access key id.')
.option('-s, --secret-access-key [SECRET_ACCESS_KEY_ID]', '# AWS secret access key.')
.option('-r, --region [REGION]', '# AWS region.')
//.option('--shared-credentials-path [SHARED_CREDENTIALS_PATH]', '# AWS shared credentials path.')
.option('-v, --verbose', '')
.command('invalidate', '# Delete expired AMIs by profile name.')
.command('preserve', '# Create AMIs with given option by profile name.')
.command('roteto', '# Execute :preserve and :invalidate at a time.')

.on('invalidate', function() {

  var aws_options = getAwsOptions();
  var ec2 = new AWS.EC2(aws_options);
  var sns = new AWS.SNS(aws_options);
  var logger = initLogger();

  logger.info("Start invalidate.");
  Invalidate.invalidate(ec2, getAmirotetoKeyname(), logger, function (err) {
    if (err) {
      logger.warn("Error on invalidate :", err);
      var sns_msg = 'Command : invalidate\r\n';
      sns_msg += 'Error message : ' + err;
      var params_publish = {
        TargetArn: config.aws.SnsTopicArn,
        Subject: config.aws.SnsSubjectPrefix + ' Failed to invalidate AMI rotate',
        Message: sns_msg,
      };
      sns.publish(params_publish, function(err, data) {
        if (err) return logger.warn('Error : sns publish, err:', err, ', data:', data);
        logger.warn('SNS published, data:', data);
      });
    }
    else {
      logger.info('Completed invalidate!');
    }
  });
})

.on('preserve', function() {

  var aws_options = getAwsOptions();
  var ec2 = new AWS.EC2(aws_options);
  var sns = new AWS.SNS(aws_options);
  var logger = initLogger();

  logger.info("Start preserve.");
  Preserve.preserve(ec2, getAmirotetoKeyname(), logger, function (err) {
    if (err) {
      logger.warn("Error on preserve :", err);
      var sns_msg = 'Command : preserve\r\n';
      sns_msg += 'Error message : ' + err;
      var params_publish = {
        TargetArn: config.aws.SnsTopicArn,
        Subject: config.aws.SnsSubjectPrefix + ' Failed to preserve AMI rotate',
        Message: sns_msg,
      };
      sns.publish(params_publish, function(err, data) {
        if (err) return logger.warn('Error : sns publish, err:', err, ', data:', data);
        logger.warn('SNS published, data:', data);
      });
    }
    else {
      logger.info('Completed preserve!');
    }
  });
})

.on('roteto', function() {

  var aws_options = getAwsOptions();
  var ec2 = new AWS.EC2(aws_options);
  var sns = new AWS.SNS(aws_options);
  var logger = initLogger();

  logger.info("Start roteto.");
  async.waterfall([
    function (next) {
      logger.info("Start preserve in roteto.");
      Preserve.preserve(ec2, getAmirotetoKeyname(), logger, function (err) { 
        if (err) logger.warn("Error : preserve on roteto :", err);
        next(err);
      });
    },
    function (next) {
      logger.info("Start invalidate in roteto.");
      Invalidate.invalidate(ec2, getAmirotetoKeyname(), logger, function (err) {
        if (err) logger.warn("Error : invalidate on roteto :", err);
        next(err);
      });
    }
  ], function (err) {
    if (err) {
      logger.warn("Error on roteto :", err);
      var sns_msg = 'Command : preserve\r\n';
      sns_msg += 'Error message : ' + err;
      var params_publish = {
        TargetArn: config.aws.SnsTopicArn,
        Subject: config.aws.SnsSubjectPrefix + ' Failed to preserve AMI rotate',
        Message: sns_msg,
      };
      sns.publish(params_publish, function(err, data) {
        if (err) return logger.warn('Error : sns publish, err:', err, ', data:', data);
        logger.warn('SNS published, data:', data);
      });
      return;
    }
    logger.info('Completed roteto!');
  });
})

.parse(process.argv);

if (!process.argv.slice(2).length) {
  return program.outputHelp();
}

function getAwsOptions() {
  return {
    region          : program.region || config.aws.region,
    accessKeyId     : program.access_key_id || config.aws.AccessKeyId,
    secretAccessKey : program.secret_access_key || config.aws.SecretAccessKey
  };
}

function getAmirotetoKeyname() {
  var profile_name = program.profile || config.profile || 'default';
  return 'amirotate:' + profile_name + ':retention_period';
}

function initLogger() {
  var transports = [];
  transports.push(new (winston.transports.Console)());
  try {
    var logdir = config.log.dir;
    if (logdir && config.log.filename) {
      if (!fs.existsSync(logdir)) fs.mkdirSync(logdir);
      var options = {
        filename: path.join(logdir, config.log.filename),
        maxsize: 10485760,
        maxFiles: 10,
        json: false,
      };
      transports.push(new (winston.transports.File)(options));
    }
  }
  catch (e) {
    console.log('Failed access log file. Please Confirm ./config/default.yaml log section.');
  }
  
  return new (winston.Logger)({
    level: program.verbose ? 'debug' : 'info',
    transports: transports
  });
}
