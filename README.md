# ami-backup

Backup Amazon EC2 AMI.
If this fails to backup, this notice by AWS SNS service.



# Install

    $ npm install -g ami-backup

# Configuration

Make pit configuration file.

~/.pit/default.yaml
```
config:
    log:
      dir: "~/ami-backup_log/"
      filename: "ami-backup.log"
    aws:
        region: "ap-northeast-1"
        AccessKeyId: "AKIA****************"
        SecretAccessKey: "/g3T************************************"
        SnsTopicArn: "arn:aws:sns:ap-northeast-1:*********:AmiRoteto"
        SnsSubjectPrefix: "[AmiRoteto]"
    profile: "default"
    tags:
        - MyTag: "MyTagValue"

```

ami-roteto require following IAM action.
* ec2:CreateImage
* ec2:CreateTags
* ec2:DeleteSnapshot
* ec2:DeregisterImage
* ec2:DescribeImages
* ec2:DescribeInstances
* ec2:DescribeTags

# 

ami-backup is to target an instance with a specific tag.  
Tag format

    Key : amirotate:(profile name):retention_period
    Value : x days

example

    Key : amirotate:default:retention_period
    Value : 3 days

# Usage

```
  Usage: ami-backup [command] [options]


  Commands:

    invalidate   # Delete expired AMIs by profile name.
    preserve     # Create AMIs with given option by profile name.
    roteto       # Execute :preserve and :invalidate at a time.
    help [cmd]   display help for [cmd]

  Options:

    -h, --help                                      output usage information
    -V, --version                                   output the version number
    -p, --profile [PROFILE]                         # Load credentials by profile name from shared credentials file.
    -k, --access-key-id [ACCESS_KEY_ID]             # AWS access key id.
    -s, --secret-access-key [SECRET_ACCESS_KEY_ID]  # AWS secret access key.
    -r, --region [REGION]                           # AWS region.
    -v, --verbose
```

