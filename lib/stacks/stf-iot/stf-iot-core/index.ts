import { Aws, Duration } from "aws-cdk-lib";
import { SubnetType, Vpc } from "aws-cdk-lib/aws-ec2";
import { ManagedPolicy, PolicyStatement, Role, ServicePrincipal } from "aws-cdk-lib/aws-iam";
import { CfnTopicRule } from "aws-cdk-lib/aws-iot";
import { Code, LayerVersion, Runtime, Function } from "aws-cdk-lib/aws-lambda"
import { SqsEventSource } from "aws-cdk-lib/aws-lambda-event-sources";
import { RetentionDays } from "aws-cdk-lib/aws-logs";
import { Topic } from "aws-cdk-lib/aws-sns"
import { SqsSubscription } from "aws-cdk-lib/aws-sns-subscriptions";
import { Queue } from "aws-cdk-lib/aws-sqs"
import { AwsCustomResource, AwsCustomResourcePolicy, PhysicalResourceId } from "aws-cdk-lib/custom-resources"
import { Construct } from "constructs"
import { Parameters } from "../../../../parameters";

export interface StfIotCoreprops {
    dns_context_broker: string,
    vpc: Vpc
}

export class StfIotCore extends Construct {
    
    public readonly sqs_stf_iot_arn: string
    public readonly sns_stf_iot : Topic

    constructor(scope: Construct, id: string, props: StfIotCoreprops){
        super(scope, id)



        // Check props
        if (!props.vpc){
            throw new Error('The property vpc is required to create an instance of StfIotCore Construct')
        }
        if (!props.dns_context_broker){
            throw new Error('The property dns_context_broker is required to create an instance of StfIotCore Construct')
        }
        

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
                compatibleRuntimes: [Runtime.NODEJS_14_X]
            })
    
            // SQS ENTRY POINT 
            const sqs_stf_endpoint = new Queue(this, 'SqsStfEndpoint', {
                queueName: `StfIoTQueue-${Aws.REGION}`
            })
            this.sqs_stf_iot_arn = sqs_stf_endpoint.queueArn
    
            // LAMBDA TO UPDATE DEVICE SHADOW 
            const lambda_update_shadow_path = `${__dirname}/lambda/updateShadow`
            const lambda_update_shadow = new Function(this, 'LambdaUpdateShadow', {
                runtime: Runtime.NODEJS_14_X,
                code: Code.fromAsset(lambda_update_shadow_path),
                handler: 'index.handler',
                timeout: Duration.seconds(15),
                logRetention: RetentionDays.THREE_MONTHS,
                environment: {
                    AWSIOTREGION: Aws.REGION,
                    AWSIOTENDPOINT: AWS_IOT_ENDPOINT,
                    SHADOW_PREFIX: Parameters.shadow_prefix,
                    TIMEOUT: Parameters.timeout
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
                resources: [`arn:aws:iot:${Aws.REGION}:${Aws.ACCOUNT_ID}:thing/*/${Parameters.shadow_prefix}-*`]
            }))

            // ADD THE SQS ENTRY POINT AS EVENT SOURCE FOR LAMBDA 
            lambda_update_shadow.addEventSource(new SqsEventSource(sqs_stf_endpoint, { batchSize: 10 }))

            // SQS FROM SNS TO LAMBDA CONTEXT BROKER 
            const sqs_to_context_broker = new Queue(this, 'SqsToLambdaContextBroker')

            // SNS FROM IOT RULE THAT LISTEN SHADOW CHANGES 
            const sns_stf_iot = new Topic(this, 'SnsTopicShadowChanges', {
                topicName: "SnsTopicStfIotShadowChanges"
            })
            
            sns_stf_iot.addSubscription(new SqsSubscription(sqs_to_context_broker, {
                rawMessageDelivery: true
            }))

            this.sns_stf_iot = sns_stf_iot

            // ROLE THAT GRANT ACCESS TO IOT RULE TO SEND MESSAGE TO SQS QUEUE 
            const iot_sqs_role = new Role(this, 'RoleStfIotRuleIngestion', {
                assumedBy: new ServicePrincipal('iot.amazonaws.com')
            })

            iot_sqs_role.addToPolicy(new PolicyStatement({
                resources: [`${sns_stf_iot.topicArn}`],
                actions: ["sns:Publish"]
            }))


            // IOT RULE THAT LISTENS TO CHANGES IN FIWARE DEVICE SHADOWS AND PUSH TO SQS
            const iot_rule = new CfnTopicRule(this, 'StfIotRuleShadowListener', {
                topicRulePayload: {
                    awsIotSqlVersion: '2016-03-23',
                    ruleDisabled: false,
                    sql: `SELECT current.state.reported.* FROM '$aws/things/+/shadow/name/+/update/documents' WHERE startswith(topic(6), '${Parameters.shadow_prefix}') AND NOT isUndefined(current.state.reported)`,
                    actions: [ 
                        {
                            sns: { targetArn: sns_stf_iot.topicArn, roleArn: iot_sqs_role.roleArn}
                        }
                    ]
                }
            })


            // LAMBDA THAT GETS MESSAGES FROM THE QUEUE AND UPDATES CONTEXT BROKER 
            const lambda_to_context_broker_path = `${__dirname}/lambda/updateContextBroker`
            const lambda_to_context_broker = new Function(this, 'LambdaUpdateContextBroker', {
                vpc: props.vpc, 
                vpcSubnets: {
                    subnetType: SubnetType.PRIVATE_WITH_NAT
                },
                runtime: Runtime.NODEJS_14_X,
                code: Code.fromAsset(lambda_to_context_broker_path),
                handler: 'index.handler',
                timeout: Duration.seconds(15),
                logRetention: RetentionDays.THREE_MONTHS,
                layers: [layer_lambda],
                environment: {
                    DNS_CONTEXT_BROKER: props.dns_context_broker,
                    URL_SMART_DATA_MODEL: Parameters.smart_data_model_url,
                    AWSIOTREGION: Aws.REGION,
                    AWSIOTENDPOINT: AWS_IOT_ENDPOINT,
                    SHADOW_PREFIX: Parameters.shadow_prefix,
                    TIMEOUT: Parameters.timeout
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
                resources: [`arn:aws:iot:${Aws.REGION}:${Aws.ACCOUNT_ID}:thing/*/${Parameters.shadow_prefix}-*`]
            }))
            
            lambda_to_context_broker.addEventSource(new SqsEventSource(sqs_to_context_broker, { batchSize: 10 }))


    }
}