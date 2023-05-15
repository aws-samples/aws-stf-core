import { Aws, Duration } from "aws-cdk-lib"

import { CfnIntegration, CfnRoute, CfnVpcLink } from "aws-cdk-lib/aws-apigatewayv2"
import { SubnetType, Vpc } from "aws-cdk-lib/aws-ec2"
import { PolicyStatement } from "aws-cdk-lib/aws-iam"
import { Runtime, Function, Code, CfnPermission, LayerVersion } from "aws-cdk-lib/aws-lambda"
import { RetentionDays } from "aws-cdk-lib/aws-logs"
import { AwsCustomResource, AwsCustomResourcePolicy, PhysicalResourceId } from "aws-cdk-lib/custom-resources"
import { Construct } from "constructs"
import { Parameters } from "../../../../parameters"


export interface StfIotApiProps {
    readonly api_ref: string,
    readonly vpc: Vpc,
    dns_context_broker: string
}

export class StfIotApi extends Construct {
   
    constructor(scope: Construct, id: string, props: StfIotApiProps){
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

        // ENABLE FLEET INDEXING
        let fleet_param 
        if(Parameters.stf_iot.shadow_indexing){
            fleet_param = {
                "thingIndexingConfiguration": {
                    "thingIndexingMode": "REGISTRY_AND_SHADOW",
                    "namedShadowIndexingMode": "ON",
                    "filter": {
                        "namedShadowNames": [
                            `${Parameters.stf_iot.shadow_prefix}-Device`
                        ]
                    }
    
                },
                "thingGroupIndexingConfiguration": {
                    "thingGroupIndexingMode": "ON"
                }
            }
        } else {
            fleet_param = {
                "thingIndexingConfiguration": {
                    "thingIndexingMode": "REGISTRY"
                },
                "thingGroupIndexingConfiguration": {
                    "thingGroupIndexingMode": "ON"
                }
            }
        }



        const fleet_indexing = new AwsCustomResource(this, 'IoTFleetIndexing', {
            onCreate: {
                service: 'Iot',
                action: 'updateIndexingConfiguration',
                physicalResourceId: PhysicalResourceId.of(Date.now().toString()),
                parameters: fleet_param
              },
              onUpdate: {
                service: 'Iot',
                action: 'updateIndexingConfiguration',
                physicalResourceId: PhysicalResourceId.of(Date.now().toString()),
                parameters: fleet_param
              },
              policy: AwsCustomResourcePolicy.fromSdkCalls({resources: AwsCustomResourcePolicy.ANY_RESOURCE})
        })

        // LAMBDA LAYER (SHARED LIBRARIES)
        const layer_lambda_path = `./lib/stacks/stf-core-iot/layers`
        const layer_lambda = new LayerVersion(this, 'LayerLambda', {
            code: Code.fromAsset(layer_lambda_path),
            compatibleRuntimes: [Runtime.NODEJS_16_X]
        })


// ********************************************** 

        /**
         *  STF VERSION 
         */

        // LAMBDA STF API VERSION
        const lambda_stf_version_path = `${__dirname}/lambda/stfVersion`
        const lambda_stf_version = new Function(this, 'LambdaStfVersion', {
            runtime: Runtime.NODEJS_16_X,
            code: Code.fromAsset(lambda_stf_version_path),
            handler: 'index.handler',
            timeout: Duration.seconds(15),
            logRetention: RetentionDays.THREE_MONTHS,
            layers: [layer_lambda],
            environment: {
                CONTEXT_BROKER: Parameters.stf_broker,
                STF_VERSION: Parameters.stf_version
                }   
        })

        const stf_version_integration = new CfnIntegration(this, 'StfVersionIntegration', {
            apiId: props.api_ref,
            integrationMethod: "GET",
            integrationType: "AWS_PROXY",
            integrationUri: lambda_stf_version.functionArn,
            connectionType: "INTERNET",
            description: "STF VERSION INTEGRATION",
            payloadFormatVersion: "1.0",
        })

        const stf_version_route = new CfnRoute(this, 'StfVersionRoute', {
            apiId: props.api_ref,
            routeKey: "GET /",
            target: `integrations/${stf_version_integration.ref}`
        })

        new CfnPermission(this, 'ApiGatewayLambdaPermissionStfVersion', {
            principal: `apigateway.amazonaws.com`,
            action: 'lambda:InvokeFunction',
            functionName: lambda_stf_version.functionName,
            sourceArn: `arn:aws:execute-api:${Aws.REGION}:${Aws.ACCOUNT_ID}:${props.api_ref}/*/*/*`
        })

        /**
        *  END POST THING 
        */


// ********************************************** 



// ********************************************** 

        /**
         *  POST THING
         */

        // LAMBDA THAT POSTS THING
        const lambda_post_thing_path = `${__dirname}/lambda/postThing`
        const lambda_post_thing = new Function(this, 'LambdaPostThing', {
            runtime: Runtime.NODEJS_16_X,
            code: Code.fromAsset(lambda_post_thing_path),
            handler: 'index.handler',
            timeout: Duration.seconds(15),
            logRetention: RetentionDays.THREE_MONTHS,
            layers: [layer_lambda],
            environment: {
                AWSIOTREGION: Aws.REGION,
                AWSIOTENDPOINT: AWS_IOT_ENDPOINT,
                SHADOW_PREFIX: Parameters.stf_iot.shadow_prefix,
                }   
        })

        lambda_post_thing.addToRolePolicy(new PolicyStatement({
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

        const post_thing_integration = new CfnIntegration(this, 'postThingIntegration', {
            apiId: props.api_ref,
            integrationMethod: "POST",
            integrationType: "AWS_PROXY",
            integrationUri: lambda_post_thing.functionArn,
            connectionType: "INTERNET",
            description: "POST THING INTEGRATION",
            payloadFormatVersion: "1.0",
        })

        const post_thing_route = new CfnRoute(this, 'PostThingRoute', {
            apiId: props.api_ref,
            routeKey: "POST /iot/things",
            target: `integrations/${post_thing_integration.ref}`
        })

        new CfnPermission(this, 'ApiGatewayLambdaPermissionPostThing', {
            principal: `apigateway.amazonaws.com`,
            action: 'lambda:InvokeFunction',
            functionName: lambda_post_thing.functionName,
            sourceArn: `arn:aws:execute-api:${Aws.REGION}:${Aws.ACCOUNT_ID}:${props.api_ref}/*/*/*`
        })

        /**
        *  END POST THING 
        */


// ********************************************** 

        /**
        *  DELETE THING 
        */

        // LAMBDA THAT DELETE THING
        const lambda_delete_thing_path = `${__dirname}/lambda/deleteThing`
        const lambda_delete_thing = new Function(this, 'LambdaDeleteThing', {
            vpc: props.vpc, 
            vpcSubnets: {
                subnetType: SubnetType.PRIVATE_WITH_EGRESS
            },
            runtime: Runtime.NODEJS_16_X,
            code: Code.fromAsset(lambda_delete_thing_path),
            handler: 'index.handler',
            timeout: Duration.seconds(15),
            logRetention: RetentionDays.THREE_MONTHS,
            layers: [layer_lambda],
            environment: {
                AWSIOTREGION: Aws.REGION,
                AWSIOTENDPOINT: AWS_IOT_ENDPOINT,
                SHADOW_PREFIX: Parameters.stf_iot.shadow_prefix,
                DNS_CONTEXT_BROKER: props.dns_context_broker,
                TIMEOUT: Parameters.stf_iot.timeout
                }   
        })

        lambda_delete_thing.addToRolePolicy(new PolicyStatement({
            actions: [
                "iot:DeleteThing",
                "iot:DeleteThingShadow",
                "iot:ListNamedShadowsForThing",

            ],
            resources: [
                `arn:aws:iot:${Aws.REGION}:${Aws.ACCOUNT_ID}:thing/*`
            ]
        }))

        const delete_thing_integration = new CfnIntegration(this, 'deleteThingIntegration', {
            apiId: props.api_ref,
            integrationMethod: "DELETE",
            integrationType: "AWS_PROXY",
            integrationUri: lambda_delete_thing.functionArn,
            connectionType: "INTERNET",
            description: "DELETE THING INTEGRATION",
            payloadFormatVersion: "1.0",
        })

        const delete_thing_route = new CfnRoute(this, 'DeleteThingRoute', {
            apiId: props.api_ref,
            routeKey: "DELETE /iot/things/{thingName}",
            target: `integrations/${delete_thing_integration.ref}`
        })

        new CfnPermission(this, 'ApiGatewayLambdaPermissionDeleteThing', {
            principal: `apigateway.amazonaws.com`,
            action: 'lambda:InvokeFunction',
            functionName: lambda_delete_thing.functionName,
            sourceArn: `arn:aws:execute-api:${Aws.REGION}:${Aws.ACCOUNT_ID}:${props.api_ref}/*/*/*`
        })

    /***
     * END DELETE THING 
     */

/************************************************************************** */


        /**
         *  GET THING
         */

        // LAMBDA THAT GETS THING
        const lambda_get_thing_path = `${__dirname}/lambda/getThing`
        const lambda_get_thing = new Function(this, 'LambdaGetThing', {
            runtime: Runtime.NODEJS_16_X,
            code: Code.fromAsset(lambda_get_thing_path),
            handler: 'index.handler',
            timeout: Duration.seconds(15),
            logRetention: RetentionDays.THREE_MONTHS,
            layers: [layer_lambda],
            environment: {
                AWSIOTREGION: Aws.REGION,
                AWSIOTENDPOINT: AWS_IOT_ENDPOINT,
                SHADOW_PREFIX: Parameters.stf_iot.shadow_prefix,
                }   
        })

        lambda_get_thing.addToRolePolicy(new PolicyStatement({
            actions: [
                "iot:GetThing",
                "iot:listNamedShadowsForThing",
                "iot:getThingShadow"
            ],
            resources: [
                `arn:aws:iot:${Aws.REGION}:${Aws.ACCOUNT_ID}:thing/*`
            ]
        }))

        const get_thing_integration = new CfnIntegration(this, 'getThingIntegration', {
            apiId: props.api_ref,
            integrationMethod: "GET",
            integrationType: "AWS_PROXY",
            integrationUri: lambda_get_thing.functionArn,
            connectionType: "INTERNET",
            description: "GET THING INTEGRATION",
            payloadFormatVersion: "1.0",
        })

        const get_thing_route = new CfnRoute(this, 'GetThingRoute', {
            apiId: props.api_ref,
            routeKey: "GET /iot/things/{thingName}",
            target: `integrations/${get_thing_integration.ref}`
        })

        new CfnPermission(this, 'ApiGatewayLambdaPermissionGetThing', {
            principal: `apigateway.amazonaws.com`,
            action: 'lambda:InvokeFunction',
            functionName: lambda_get_thing.functionName,
            sourceArn: `arn:aws:execute-api:${Aws.REGION}:${Aws.ACCOUNT_ID}:${props.api_ref}/*/*/*`
        })

        /**
        *  END GET THING 
        */

        /************************************************************************** */


        /**
         *  GET THINGS
         */

        // LAMBDA THAT GETS THING
        const lambda_get_things_path = `${__dirname}/lambda/getThings`
        const lambda_get_things = new Function(this, 'LambdaGetThings', {
            runtime: Runtime.NODEJS_16_X,
            code: Code.fromAsset(lambda_get_things_path),
            handler: 'index.handler',
            timeout: Duration.seconds(15),
            logRetention: RetentionDays.THREE_MONTHS,
            layers: [layer_lambda],
            environment: {
                AWSIOTREGION: Aws.REGION,
                AWSIOTENDPOINT: AWS_IOT_ENDPOINT,
                SHADOW_PREFIX: Parameters.stf_iot.shadow_prefix,
                }   
        })

        lambda_get_things.addToRolePolicy(new PolicyStatement({
            actions: [
                "iot:searchIndex"
            ],
            resources: [
                `arn:aws:iot:${Aws.REGION}:${Aws.ACCOUNT_ID}:index/*`
            ]
        }))

        const get_things_integration = new CfnIntegration(this, 'getThingsIntegration', {
            apiId: props.api_ref,
            integrationMethod: "GET",
            integrationType: "AWS_PROXY",
            integrationUri: lambda_get_things.functionArn,
            connectionType: "INTERNET",
            description: "GET THINGS INTEGRATION",
            payloadFormatVersion: "1.0",
        })

        const get_things_route = new CfnRoute(this, 'GetThingsRoute', {
            apiId: props.api_ref,
            routeKey: "GET /iot/things",
            target: `integrations/${get_things_integration.ref}`
        })

        new CfnPermission(this, 'ApiGatewayLambdaPermissionGetThings', {
            principal: `apigateway.amazonaws.com`,
            action: 'lambda:InvokeFunction',
            functionName: lambda_get_things.functionName,
            sourceArn: `arn:aws:execute-api:${Aws.REGION}:${Aws.ACCOUNT_ID}:${props.api_ref}/*/*/*`
        })

        /**
        *  END GET THINGS
        */



        /************************************************************************** */


        /**
         *  GET INDEX
         */

        // LAMBDA THAT GETS IoT INDEX
        const lambda_get_index_path = `${__dirname}/lambda/getIndex`
        const lambda_get_index = new Function(this, 'LambdaGetIndex', {
            runtime: Runtime.NODEJS_16_X,
            code: Code.fromAsset(lambda_get_index_path),
            handler: 'index.handler',
            timeout: Duration.seconds(15),
            logRetention: RetentionDays.THREE_MONTHS,
            layers: [layer_lambda],
            environment: {
                AWSIOTREGION: Aws.REGION,
                AWSIOTENDPOINT: AWS_IOT_ENDPOINT,
                SHADOW_PREFIX: Parameters.stf_iot.shadow_prefix,
                }   
        })

        lambda_get_index.addToRolePolicy(new PolicyStatement({
            actions: [
                "iot:GetIndexingConfiguration"
            ],
            resources: ['*']
        }))

        const get_index_integration = new CfnIntegration(this, 'getIndexIntegration', {
            apiId: props.api_ref,
            integrationMethod: "GET",
            integrationType: "AWS_PROXY",
            integrationUri: lambda_get_index.functionArn,
            connectionType: "INTERNET",
            description: "GET INDEX INTEGRATION",
            payloadFormatVersion: "1.0",
        })

        const get_index_route = new CfnRoute(this, 'GetIndexRoute', {
            apiId: props.api_ref,
            routeKey: "GET /iot/index",
            target: `integrations/${get_index_integration.ref}`
        })

        new CfnPermission(this, 'ApiGatewayLambdaPermissionGetIndex', {
            principal: `apigateway.amazonaws.com`,
            action: 'lambda:InvokeFunction',
            functionName: lambda_get_index.functionName,
            sourceArn: `arn:aws:execute-api:${Aws.REGION}:${Aws.ACCOUNT_ID}:${props.api_ref}/*/*/*`
        })

        /**
        *  END GET INDEX
        */


        /************************************************************************** */


        /**
         *  POST INDEX
         */

        // LAMBDA THAT POSTS IoT INDEX
        const lambda_post_index_path = `${__dirname}/lambda/postIndex`
        const lambda_post_index = new Function(this, 'LambdaPostIndex', {
            runtime: Runtime.NODEJS_16_X,
            code: Code.fromAsset(lambda_post_index_path),
            handler: 'index.handler',
            timeout: Duration.seconds(15),
            logRetention: RetentionDays.THREE_MONTHS,
            layers: [layer_lambda],
            environment: {
                AWSIOTREGION: Aws.REGION,
                AWSIOTENDPOINT: AWS_IOT_ENDPOINT,
                SHADOW_PREFIX: Parameters.stf_iot.shadow_prefix,
                }   
        })

        lambda_post_index.addToRolePolicy(new PolicyStatement({
            actions: [
                "iot:GetIndexingConfiguration",
                "iot:UpdateIndexingConfiguration"
            ],
            resources: [`*`]
        }))

        const post_index_integration = new CfnIntegration(this, 'postIndexIntegration', {
            apiId: props.api_ref,
            integrationMethod: "POST",
            integrationType: "AWS_PROXY",
            integrationUri: lambda_post_index.functionArn,
            connectionType: "INTERNET",
            description: "POST INDEX INTEGRATION",
            payloadFormatVersion: "1.0",
        })

        const post_index_route = new CfnRoute(this, 'postIndexRoute', {
            apiId: props.api_ref,
            routeKey: "POST /iot/index",
            target: `integrations/${post_index_integration.ref}`
        })

        new CfnPermission(this, 'ApiGatewayLambdaPermissionPostIndex', {
            principal: `apigateway.amazonaws.com`,
            action: 'lambda:InvokeFunction',
            functionName: lambda_post_index.functionName,
            sourceArn: `arn:aws:execute-api:${Aws.REGION}:${Aws.ACCOUNT_ID}:${props.api_ref}/*/*/*`
        })

        /**
        *  END POST INDEX
        */



// ********************************************** 

        /**
        *  DELETE INDEX 
        */

        // LAMBDA THAT DELETE INDEX
        const lambda_delete_index_path = `${__dirname}/lambda/deleteIndex`
        const lambda_delete_index= new Function(this, 'LambdaDeleteIndex', {
            vpc: props.vpc, 
            vpcSubnets: {
                subnetType: SubnetType.PRIVATE_WITH_EGRESS
            },
            runtime: Runtime.NODEJS_16_X,
            code: Code.fromAsset(lambda_delete_index_path),
            handler: 'index.handler',
            timeout: Duration.seconds(15),
            logRetention: RetentionDays.THREE_MONTHS,
            layers: [layer_lambda],
            environment: {
                AWSIOTREGION: Aws.REGION,
                AWSIOTENDPOINT: AWS_IOT_ENDPOINT,
                SHADOW_PREFIX: Parameters.stf_iot.shadow_prefix,
                }   
        })

        lambda_delete_index.addToRolePolicy(new PolicyStatement({
            actions: [
                "iot:GetIndexingConfiguration",
                "iot:UpdateIndexingConfiguration"

            ],
            resources: [`*`]
        }))

        const delete_index_integration = new CfnIntegration(this, 'deleteIndexIntegration', {
            apiId: props.api_ref,
            integrationMethod: "DELETE",
            integrationType: "AWS_PROXY",
            integrationUri: lambda_delete_index.functionArn,
            connectionType: "INTERNET",
            description: "DELETE INDEX INTEGRATION",
            payloadFormatVersion: "1.0",
        })

        const delete_index_route = new CfnRoute(this, 'DeleteIndexRoute', {
            apiId: props.api_ref,
            routeKey: "DELETE /iot/index/{index}",
            target: `integrations/${delete_index_integration.ref}`
        })

        new CfnPermission(this, 'ApiGatewayLambdaPermissionDeleteIndex', {
            principal: `apigateway.amazonaws.com`,
            action: 'lambda:InvokeFunction',
            functionName: lambda_delete_index.functionName,
            sourceArn: `arn:aws:execute-api:${Aws.REGION}:${Aws.ACCOUNT_ID}:${props.api_ref}/*/*/*`
        })

    /***
     * END DELETE INDEX 
     */

/************************************************************************** */







    }
}