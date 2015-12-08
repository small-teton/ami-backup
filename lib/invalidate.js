'use strict';

var async = require('async');
var _ = require('lodash');

exports.invalidate = function(ec2, amiroteto_keyname, logger, callback) {

  async.waterfall([

    function (next) {
      var params_describeImages = {
        Filters: [ { Name: 'tag-key', Values: [amiroteto_keyname] } ],
        Owners: ['self']
      };
      ec2.describeImages(params_describeImages, function(err, data) {
        if (err) return next(err);
        
        var imageIds = []
        var snapshotIds = [];
        _.forEach(data.Images, function(image, index) {
          var creationData = new Date(image.CreationDate);
          var expiration_time = new Date();
          expiration_time.setDate(expiration_time.getDate()-1);
          if (creationData.getTime() > expiration_time.getTime()) {
            logger.info("Image %s (%s) is not yet expired (Expire at %s). Skipping.", image.ImageId, image.Name, expiration_time.toISOString());
            return;
          }
          
          imageIds.push(image.ImageId);
          _.forEach(image.BlockDeviceMappings, function (BlockDeviceMapping, index2) {
            snapshotIds.push(BlockDeviceMapping.Ebs.SnapshotId);
          });
        });
        next(null, imageIds, snapshotIds)
      });
    },

    function (imageIds, snapshotIds, next) {
      async.map(imageIds, function(imageId, callback) {
        var params_deregisterImage = {
          ImageId: imageId,
        };
        ec2.deregisterImage(params_deregisterImage, function(err, data){
          if (err) return logger.debug('error on deregisterImage :', err);
          logger.info("Image %s is expired. Deregistered AMI.", imageId);
          callback(err);
        });
      }, function (err, results) {
        if (err) return next(err);
        next(null, snapshotIds);
      });
    },

    function (snapshotIds, next) {
      async.map(snapshotIds, function(snapshotId, callback) {
        var params_deleteSnapshot = {
          SnapshotId: snapshotId
        };
        ec2.deleteSnapshot(params_deleteSnapshot, function(err, data) {
          if (err) return logger.debug('error on deleteSnapshot :', err);
          logger.info("Deleted snapshot %s.", snapshotId);
          callback(err);
        });
      }, function (err, results) {
        next(err);
      });
    }

  ], function (err) {
    if (err) {
      logger.debug("Error : on invalidate(). : %s", err);
    }
    callback(err);
  });

};