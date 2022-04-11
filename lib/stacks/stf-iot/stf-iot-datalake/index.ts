import { Aws, Duration} from "aws-cdk-lib";
import { PolicyStatement, Role, ServicePrincipal } from "aws-cdk-lib/aws-iam";
import { CfnDeliveryStream } from "aws-cdk-lib/aws-kinesisfirehose";
import { Runtime, Function, Code } from "aws-cdk-lib/aws-lambda";
import { RetentionDays } from "aws-cdk-lib/aws-logs";
import { Bucket } from "aws-cdk-lib/aws-s3";
import { CfnSubscription, Topic } from "aws-cdk-lib/aws-sns";
import { Construct } from "constructs";

export interface StfIotDataLakeProps {
    sns_stf_iot_arn: string
}

export class StfIotDataLake extends Construct {
    constructor(scope: Construct, id: string, props: StfIotDataLakeProps){
        super(scope, id)

        // Check props
        if (!props.sns_stf_iot_arn){
            throw new Error('The property sns_stf_iot_arn is required to create an instance of StfIotDataLake Construct')
        }

        const sns_stf_iot = Topic.fromTopicArn(this, 'StfSnsIot', props.sns_stf_iot_arn)

        // CREATE THE IOT DATALAKE BUCKET 

        const bucket = new Bucket(this, 'BucketStfIotDataLake', {
            bucketName: `stf-iot-datalake-${Aws.REGION}-${Aws.ACCOUNT_ID}`
        })

        //  (COULD BE REPLACED BY AN EXISTING ONE, SEE COMMENTED CODE BELOW)
        //const bucket = Bucket.fromBucketName(this, 'BucketStfIotDataLake', `stf-iot-datalake-${Aws.REGION}-${Aws.ACCOUNT_ID}`)

        // Role for Kinesis firehose 
        const role_firehose = new Role(this, 'FirehoseRole', {
            assumedBy: new ServicePrincipal('firehose.amazonaws.com')
        })
        bucket.grantReadWrite(role_firehose)

        // Role for SNS
        const role_sns = new Role(this, 'RoleSnsFirehose', {
            assumedBy: new ServicePrincipal('sns.amazonaws.com')
        })

        // LAMBDA TRANSFORM FROM KINESIS FIREHOSE TO S3 GETTING Message
        const lambda_transform_path= `${__dirname}/lambda/transform`
        const lambda_transform = new Function(this, 'LambdaKinesisTransform', {
            runtime: Runtime.NODEJS_14_X,
            code: Code.fromAsset(lambda_transform_path),
            handler: 'index.handler',
            timeout: Duration.seconds(15),
            logRetention: RetentionDays.THREE_MONTHS
        })
        lambda_transform.grantInvoke(role_firehose)

        // KINESIS FIREHOSE DELIVERY STREAM 
        const kinesis_firehose = new CfnDeliveryStream(this, 'KinesisFirehoseDeliveryStfIotDataLake', {
            deliveryStreamName: 'StfIotDataLakeKinesisFirehose', 
                deliveryStreamType: 'DirectPut',
                extendedS3DestinationConfiguration:{
                    bucketArn: bucket.bucketArn,
                    roleArn: role_firehose.roleArn,
                    bufferingHints: {
                        intervalInSeconds: 120,
                        sizeInMBs: 5
                    },
                    processingConfiguration: {
                        enabled: true, 
                        processors: [
                            {
                                type: 'Lambda',
                                parameters: [{
                                    parameterName: 'LambdaArn',
                                    parameterValue: lambda_transform.functionArn
                                }]
                            }
                        ]
                    }
                }
        })

        role_sns.addToPolicy(new PolicyStatement({
            actions:[
                "firehose:DescribeDeliveryStream",
                "firehose:ListDeliveryStreams",
                "firehose:ListTagsForDeliveryStream",
                "firehose:PutRecord",
                "firehose:PutRecordBatch"
                ],
                resources: [
                    `${kinesis_firehose.attrArn}`
                ]
        }))

        // CREATE A SUBSCRIPTION TO SNS TOPIC
        const sns_sub_firehose = new CfnSubscription(this, 'SnsSubFirehose', {
            endpoint: `${kinesis_firehose.attrArn}`,
            protocol: 'firehose',
            topicArn: sns_stf_iot.topicArn,
            subscriptionRoleArn: role_sns.roleArn
        })

    }
}