import { CfnOutput} from "aws-cdk-lib"
import { CfnApi, CfnIntegration, CfnRoute, CfnStage, CfnVpcLink } from "aws-cdk-lib/aws-apigatewayv2"
import { Vpc } from "aws-cdk-lib/aws-ec2"
import { ApplicationLoadBalancedFargateService } from "aws-cdk-lib/aws-ecs-patterns"
import { Construct } from "constructs"
import { Parameters } from "../../../../parameters"

export interface ScorpioServerlessApiGatewayProps {
    readonly vpc: Vpc,
    readonly fargate_alb: ApplicationLoadBalancedFargateService
}

export class ScorpioServerlessApiGateway extends Construct{
    public readonly api_ref: string
    constructor(scope: Construct, id: string, props: ScorpioServerlessApiGatewayProps) {
        super(scope, id)
        
        // Check props
        if (!props.vpc){
            throw new Error('The property vpc is required to create an instance of ScorpioServerlessApiGateway Construct')
        }
        if (!props.fargate_alb){
            throw new Error('The property fargate_alb is required to create an instance of ScorpioServerlessApiGateway Construct')
        }

        const vpc_link = new CfnVpcLink(this, 'VpcLink', {
            name: Parameters.vpc_link_name , 
            subnetIds: props.vpc.privateSubnets.map( (m) => m.subnetId)
        })

        const api = new CfnApi(this, 'HttpApi', {
            name: 'stfApi', 
            protocolType: 'HTTP',
            corsConfiguration: {
                allowHeaders: ['*'],
                allowMethods: ['*'],
                allowOrigins: ['*']
            },
            

        })

        const stage = new CfnStage(this, 'StageApi', {
            apiId: api.ref,
            stageName: '$default',
            autoDeploy: true
        })

        const integration = new CfnIntegration(this, 'HttpApiIntegration', {
            apiId: api.ref,
            integrationMethod: "ANY",
            integrationType: "HTTP_PROXY",
            connectionType: "VPC_LINK",
            description: "API Integration",
            connectionId: vpc_link.ref, 
            integrationUri: props.fargate_alb.listener.listenerArn,
            payloadFormatVersion: "1.0",
        })

        const route = new CfnRoute(this, 'Route', {
            apiId: api.ref,
            routeKey: "ANY /{proxy+}",
            target: `integrations/${integration.ref}`
        })

        this.api_ref = api.ref

    }
}