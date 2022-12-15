import { Aws, Duration } from "aws-cdk-lib";
import { SubnetType, Vpc } from "aws-cdk-lib/aws-ec2";
import { ManagedPolicy, PolicyStatement, Role, ServicePrincipal } from "aws-cdk-lib/aws-iam";
import { CfnTopicRule } from "aws-cdk-lib/aws-iot";
import { CfnDeliveryStream } from "aws-cdk-lib/aws-kinesisfirehose";
import { Code, LayerVersion, Runtime, Function } from "aws-cdk-lib/aws-lambda"
import { SqsEventSource } from "aws-cdk-lib/aws-lambda-event-sources";
import { RetentionDays } from "aws-cdk-lib/aws-logs";
import { Bucket } from "aws-cdk-lib/aws-s3";
import { Topic } from "aws-cdk-lib/aws-sns"
import { SqsSubscription } from "aws-cdk-lib/aws-sns-subscriptions";
import { Queue } from "aws-cdk-lib/aws-sqs"
import { AwsCustomResource, AwsCustomResourcePolicy, PhysicalResourceId } from "aws-cdk-lib/custom-resources"
import { Construct } from "constructs"
import { Parameters } from "../../../../parameters";

export interface StfIotCoreprops {
    dns_context_broker: string,
    vpc: Vpc,
    bucket_arn: string
}

export class StfIotCore extends Construct {
    
    public readonly sqs_stf_iot_arn: string
    public readonly sns_stf_iot : Topic

    constructor(scope: Construct, id: string, props: StfIotCoreprops){
        super(scope, id)



        //CHECK PROPS
        if (!props.vpc){
            throw new Error('The property vpc is required to create an instance of StfIotCore Construct')
        }
        if (!props.dns_context_broker){
            throw new Error('The property dns_context_broker is required to create an instance of StfIotCore Construct')
        }
        if (!props.bucket_arn){
            throw new Error('The property bucket_arn is required to create an instance of StfIotCore Construct')
        }
    

        // IoT DATALAKE BUCKET
        const bucket = Bucket.fromBucketArn(this, 'IoTBucket', props.bucket_arn)

        //AWS IoT ENDPOINT
        const get_iot_endpoint = new AwsCustomResource(this, 'IotEndpoint', {
            onCreate: {
                service: 'Iot',
                action: 'describeEndpoint',
                physicalResourceId: PhysicalResourceId.fromResponse('endpointAddress'),
                parameters: {
                "endpointType": "iot:Data-ATS"
                }
            },
            policy: AwsCustomResourcePolicy.fromSdkCalls({resources: AwsCustomResourcePolicy.ANY_RESOURCE})
        })
    
        const AWS_IOT_ENDPOINT = get_iot_endpoint.getResponseField('endpointAddress')


        // LAMBDA LAYER (SHARED LIBRARIES)
        const layer_lambda_path = `./lib/stacks/stf-iot/layers`
        const layer_lambda = new LayerVersion(this, 'LayerLambda', {
            code: Code.fromAsset(layer_lambda_path),
            compatibleRuntimes: [Runtime.NODEJS_16_X]
        })

        // SQS ENTRY POINT 
        const sqs_stf_endpoint = new Queue(this, 'SqsStfEndpoint', {
            queueName: Parameters.stf_iot.sqs_iot_queue_name
        })
        this.sqs_stf_iot_arn = sqs_stf_endpoint.queueArn
    
        // LAMBDA TO UPDATE DEVICE SHADOW 
        const lambda_update_shadow_path = `${__dirname}/lambda/updateShadow`
        const lambda_update_shadow = new Function(this, 'LambdaUpdateShadow', {
            runtime: Runtime.NODEJS_16_X,
            code: Code.fromAsset(lambda_update_shadow_path),
            handler: 'index.handler',
            timeout: Duration.seconds(15),
            logRetention: RetentionDays.THREE_MONTHS,
            environment: {
                AWSIOTREGION: Aws.REGION,
                AWSIOTENDPOINT: AWS_IOT_ENDPOINT,
                SHADOW_PREFIX: Parameters.stf_iot.shadow_prefix,
                TIMEOUT: Parameters.stf_iot.timeout
            }
        })


        // ADD PERMISSION FOR LAMBDA THAT UPDATES SHADOW TO ACCESS SQS ENTRY POINT
        lambda_update_shadow.addToRolePolicy(new PolicyStatement({
            actions: [
                "sqs:ReceiveMessage",
                "sqs:DeleteMessage",
                "sqs:GetQueueAttributes"
            ],
            resources: [`${sqs_stf_endpoint.queueArn}`]
        }))


        // ADD PERMISSION TO ACCESS AWS IoT DEVICE SHADOW
        lambda_update_shadow.addToRolePolicy(new PolicyStatement({
            actions: ["iot:UpdateThingShadow"],
            resources: [`arn:aws:iot:${Aws.REGION}:${Aws.ACCOUNT_ID}:thing/*/${Parameters.stf_iot.shadow_prefix}-*`]
        }))

        // ADD THE SQS ENTRY POINT AS EVENT SOURCE FOR LAMBDA 
        lambda_update_shadow.addEventSource(new SqsEventSource(sqs_stf_endpoint, { batchSize: 10 }))

        // SQS TO LAMBDA CONTEXT BROKER 
        const sqs_to_context_broker = new Queue(this, 'SqsToLambdaContextBroker')

        // ROLE THAT GRANTS ACCESS TO FIREHOSE TO READ/WRITE BUCKET
        const role_firehose = new Role(this, 'FirehoseRole', {
            assumedBy: new ServicePrincipal('firehose.amazonaws.com')
        })
        bucket.grantReadWrite(role_firehose)

                // KINESIS FIREHOSE DELIVERY STREAM 
                const kinesis_firehose = new CfnDeliveryStream(this, 'KinesisFirehoseDeliveryStfIotDataLake', {
                    deliveryStreamName: 'StfIotDataLakeKinesisFirehose', 
                        deliveryStreamType: 'DirectPut',
                        extendedS3DestinationConfiguration:{
                            bucketArn: bucket.bucketArn,
                            roleArn: role_firehose.roleArn,
                            bufferingHints: {
                                intervalInSeconds: 60,
                                sizeInMBs: 64
                            },
                            processingConfiguration: {
                                enabled: true, 
                                processors: [
                                    {
                                        type: 'MetadataExtraction', 
                                            parameters: 
                                            [ 
                                              {
                                                parameterName: "MetadataExtractionQuery", 
                                                parameterValue: "{type:.type}"
                                              },
                                              {
                                                parameterName: "JsonParsingEngine", 
                                                parameterValue: "JQ-1.6"
                                              },
                                            ]
                                    }
                                ]
                            },
                            dynamicPartitioningConfiguration: {
                                enabled: true
                            },
                            prefix: `type=!{partitionKeyFromQuery:type}/dt=!{timestamp:yyyy}-!{timestamp:MM}-!{timestamp:dd}-!{timestamp:HH}/`,
                            errorOutputPrefix: `type=!{firehose:error-output-type}/dt=!{timestamp:yyy}-!{timestamp:MM}-!{timestamp:dd}-!{timestamp:HH}/`
                        }
                        
                })


        // ROLE THAT GRANT ACCESS TO IOT RULE TO ACTIONS
        const iot_rule_actions_role = new Role(this, 'RoleStfIotRuleIngestion', {
            assumedBy: new ServicePrincipal('iot.amazonaws.com')
        })
        iot_rule_actions_role.addToPolicy(new PolicyStatement({
            resources: [
                `${sqs_to_context_broker.queueArn}`,
                `${kinesis_firehose.attrArn}`
            ],
            actions: [
                "sqs:SendMessage",
                "firehose:DescribeDeliveryStream",
                "firehose:ListDeliveryStreams",
                "firehose:ListTagsForDeliveryStream",
                "firehose:PutRecord",
                "firehose:PutRecordBatch"
            ]
        }))

        // IOT RULE THAT LISTENS TO CHANGES IN FIWARE DEVICE SHADOWS AND PUSH TO SQS
        const iot_rule = new CfnTopicRule(this, 'StfIotRuleShadowListener', {
            topicRulePayload: {
                awsIotSqlVersion: '2016-03-23',
                ruleDisabled: false,
                sql: `SELECT current.state.reported.* 
                        FROM '$aws/things/+/shadow/name/+/update/documents' 
                        WHERE startswith(topic(6), '${Parameters.stf_iot.shadow_prefix}') 
                        AND NOT isUndefined(current.state.reported.type)`,
                actions: [ 
                    {
                        sqs: {
                        queueUrl: sqs_to_context_broker.queueUrl,
                        roleArn: iot_rule_actions_role.roleArn
                        }
                    },
                    {
                        firehose: {
                            deliveryStreamName: kinesis_firehose.ref,
                            roleArn: iot_rule_actions_role.roleArn,
                            separator: "\n"
                        }
                    }
                ]
            }
        })


        // LAMBDA THAT GETS MESSAGES FROM THE QUEUE AND UPDATES CONTEXT BROKER 
        const lambda_to_context_broker_path = `${__dirname}/lambda/updateContextBroker`
        const lambda_to_context_broker = new Function(this, 'LambdaUpdateContextBroker', {
            vpc: props.vpc, 
            vpcSubnets: {
                subnetType: SubnetType.PRIVATE_WITH_EGRESS
            },
            runtime: Runtime.NODEJS_16_X,
            code: Code.fromAsset(lambda_to_context_broker_path),
            handler: 'index.handler',
            timeout: Duration.seconds(15),
            logRetention: RetentionDays.THREE_MONTHS,
            layers: [layer_lambda],
            environment: {
                DNS_CONTEXT_BROKER: props.dns_context_broker,
                URL_SMART_DATA_MODEL: Parameters.stf_iot.smart_data_model_url,
                AWSIOTREGION: Aws.REGION,
                AWSIOTENDPOINT: AWS_IOT_ENDPOINT,
                SHADOW_PREFIX: Parameters.stf_iot.shadow_prefix,
                TIMEOUT: Parameters.stf_iot.timeout
            }
        })

        lambda_to_context_broker.addToRolePolicy(new PolicyStatement({
            actions: [
                "logs:CreateLogGroup",
                "logs:CreateLogStream",
                "logs:PutLogEvents",
                "ec2:CreateNetworkInterface",
                "ec2:DescribeNetworkInterfaces",
                "ec2:DeleteNetworkInterface",
                "ec2:AssignPrivateIpAddresses",
                "ec2:UnassignPrivateIpAddresses"
            ], 
            resources: ['*']
        }))

        // ADD PERMISSION FOR LAMBDA TO ACCESS SQS 
        lambda_to_context_broker.addToRolePolicy(new PolicyStatement({
            actions: [
                "sqs:ReceiveMessage",
                "sqs:DeleteMessage",
                "sqs:GetQueueAttributes"
            ],
            resources: [`${sqs_to_context_broker.queueArn}`]
        }))            

        lambda_to_context_broker.addToRolePolicy(new PolicyStatement({
            actions: [
                "iot:UpdateThingShadow",
                "iot:GetThingShadow"
            ],
            resources: [`arn:aws:iot:${Aws.REGION}:${Aws.ACCOUNT_ID}:thing/*/${Parameters.stf_iot.shadow_prefix}-*`]
        }))
        
        lambda_to_context_broker.addEventSource(new SqsEventSource(sqs_to_context_broker, { batchSize: 10 }))


    }
}