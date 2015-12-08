'use strict';

var async = require('async');
var _ = require('lodash');

exports.preserve = function(ec2, amiroteto_keyname, logger, callback) {
  
  (function searchInstances() {
    var params_describeInstances = {
      Filters: [ { Name: 'tag-key', Values: [amiroteto_keyname] } ]
    };
    ec2.describeInstances(params_describeInstances, function(err, data) {
      if (err) return callback(err);
      
      var bkup_instances = [];
      _.forEach(data.Reservations, function(reservation, index) {
        _.forEach(reservation.Instances, function (instance, index) {
          var tag_name = _.find(instance.Tags, {'Key': 'Name'}).Value;
          var tag_retention_priod = _.find(instance.Tags, {'Key': amiroteto_keyname}).Value;
          tag_retention_priod = Number(tag_retention_priod.split(' ').slice(0,1));
          bkup_instances.push({instanceId: instance.InstanceId, name: tag_name, retention_priod: tag_retention_priod});
        });
      });
      
      async.map(bkup_instances, function (instance, callback) {
        createTagsForAmiAndSnapshots(instance, callback);
      }, function (err, results) {
        callback(err);
      });
    });
  })();
  
  function createTagsForAmiAndSnapshots(instance, callback) {
    async.waterfall([
      // AMIを作成
      function (next) {
        var nowDateTime = new Date();
        var str_nowDateTime = makeDateTimeString(nowDateTime);
        var params_createImage = {
          DryRun: false,
          InstanceId: instance.instanceId, /* required */
          Name: instance.instanceId + ' - ' + str_nowDateTime, /* required */
          Description: 'Created By node-amiroteto',
          NoReboot: true
        };
        ec2.createImage(params_createImage, function(err, data) {
          if (err) return next(err);
          
          logger.info("Created image from instance %s (%s). Retention period is %s.", instance.instanceId, instance.name, instance.retention_priod + ' day');
          next(null, data.ImageId);
        });
      },
      // 作成したAMIにタグを付ける
      function (imageId, next) {
        var params_createTags = {
          DryRun: false,
          Resources: [imageId],
          Tags: [
            { Key: 'Name', Value: instance.name },
            { Key: 'Owner', Value: 'matsuuram' },
            { Key: amiroteto_keyname, Value: instance.tag_retention_priod + ' day' },
          ]
        };
        ec2.createTags(params_createTags, function(err, data) {
          if (err) return next(err);
          
          logger.debug('Created Tag for AMI(%s) : %j', imageId, params_createTags.Tags);
          next(null, imageId);
        });
      },
      // 作成したAMIを探してSnapshotIdを取得する
      function (imageId, next) {
        createTagsForBackupedSnapshots(imageId, instance.name, next);
      }
    ], function (err) {
      callback(err);
    });
  }
  
  function createTagsForBackupedSnapshots(imageId, instanceName, callback) {
    
    var params_describeImages = {
      DryRun: false,
      ImageIds: [imageId],
      Owners: ['self']
    };
    
    var counter = 0;
    (function onDetectSnapshotIds() {
      ec2.describeImages(params_describeImages, function(err, data) {
        if (err) return callback(err);
        
        var snapshotIds = [];
        _.forEach(data.Images, function(image, index) {
          _.forEach(image.BlockDeviceMappings, function (BlockDeviceMapping, index) {
            snapshotIds.push(BlockDeviceMapping.Ebs.SnapshotId);
          });
        });
        logger.info('Waiting for the snapshot is created.', '( ImageId :', imageId, ', snapshotIds :', snapshotIds, ')', 'Try count =', ++counter);
        // snapshotIdが検出できるまでポーリングする
        if (snapshotIds && snapshotIds.length === 0) {
          return setTimeout(onDetectSnapshotIds, 60000);
        }
        
        createTags(snapshotIds, callback);
      });
    })();
    
    function createTags(snapshotIds, callback) {
      async.map(snapshotIds, function(snapshotId, callback) {
        var params_createTags = {
          DryRun: false,
          Resources: [snapshotId],
          Tags: [ 
            { Key: 'Name', Value: instanceName },
            { Key: 'Owner', Value: 'matsuuram' }
          ]
        };
        ec2.createTags(params_createTags, function(err, data){
          if (err) return callback(err);
          
          logger.debug('Created Tag for snapshot(%s) : %j', snapshotId, params_createTags.Tags);
          callback(null);
        });
      }, function (err, results) {
        callback(err);
      });
    }
  }
  
  function makeDateTimeString(d){
    function pad(n){return n<10 ? '0'+n : n}
    return d.getUTCFullYear()+'-'
        + pad(d.getUTCMonth()+1)+'-'
        + pad(d.getUTCDate())+' '
        + pad(d.getUTCHours())+'.'
        + pad(d.getUTCMinutes())+'.'
        + pad(d.getUTCSeconds())
  }
}

