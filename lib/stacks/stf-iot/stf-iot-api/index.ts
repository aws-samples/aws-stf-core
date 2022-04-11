import { Aws, Duration } from "aws-cdk-lib"
import { LambdaIntegration, RestApi } from "aws-cdk-lib/aws-apigateway"
import { PolicyStatement } from "aws-cdk-lib/aws-iam"
import { Runtime, Function, Code } from "aws-cdk-lib/aws-lambda"
import { RetentionDays } from "aws-cdk-lib/aws-logs"
import { AwsCustomResource, AwsCustomResourcePolicy, PhysicalResourceId } from "aws-cdk-lib/custom-resources"
import { Construct } from "constructs"
import { Parameters } from "../../../../parameters"


export interface StfIotApiProps {
}

export class StfIotApi extends Construct {
   
    public readonly iot_api_endpoint: string

    constructor(scope: Construct, id: string, props?: StfIotApiProps){
        super(scope, id)


        // GET AWS IOT ENDPOINT 
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

        const api_iot_stf = new RestApi(this, 'ApiStfIot')

        // DEVICE MANAGEMENT RESOURCE
        const resource_device = api_iot_stf.root.addResource('devices')

        // LAMBDA THAT ADDS DEVICES
        const lambda_post_device_path = `${__dirname}/lambda/postDevice`
        const lambda_post_device = new Function(this, 'LambdaPostDevice', {
            runtime: Runtime.NODEJS_14_X,
            code: Code.fromAsset(lambda_post_device_path),
            handler: 'index.handler',
            timeout: Duration.seconds(15),
            logRetention: RetentionDays.THREE_MONTHS,
            environment: {
                AWSIOTREGION: Aws.REGION,
                AWSIOTENDPOINT: AWS_IOT_ENDPOINT,
                SHADOW_PREFIX: Parameters.shadow_prefix,
                }   
        })

        lambda_post_device.addToRolePolicy(new PolicyStatement({
            actions: [
                "iot:UpdateThingGroup",
                "iot:CreateThingGroup",
                "iot:CreateThing",
                "iot:AddThingToThingGroup",
                "iot:UpdateThingGroupsForThing",
                "iot:UpdateThingShadow"
            ],
            resources: [
                `arn:aws:iot:${Aws.REGION}:${Aws.ACCOUNT_ID}:thinggroup/*`,
                `arn:aws:iot:${Aws.REGION}:${Aws.ACCOUNT_ID}:thing/*`
            ]
        }))

        const integration_post_device = new LambdaIntegration(lambda_post_device)
        resource_device.addMethod('POST', integration_post_device, {apiKeyRequired: true})

        // ADD API KEY FOR THE API 
        const api_key=   api_iot_stf.addApiKey('StfIotApiKey', {
            apiKeyName: 'stf_iot_api_key', 
            value: Parameters.iot_api_key
        })

        const plan_api_iot_stf = api_iot_stf.addUsagePlan('UsagePlan', {
            name: 'Admin'
        })

        plan_api_iot_stf.addApiKey(api_key)
        
        plan_api_iot_stf.addApiStage({
            stage: api_iot_stf.deploymentStage
        })

        this.iot_api_endpoint = api_iot_stf.url




    }
}