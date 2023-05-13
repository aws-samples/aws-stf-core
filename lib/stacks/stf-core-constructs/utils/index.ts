import { Construct } from "constructs";
import { azlist } from "./azlist"
import { CfnOutput, CustomResource, Duration, Stack } from "aws-cdk-lib";
import { Code, Runtime, Function } from "aws-cdk-lib/aws-lambda";
import { PolicyStatement } from "aws-cdk-lib/aws-iam";
import { Provider } from "aws-cdk-lib/custom-resources";

export interface StfUtilProps {}

export class Utils extends Construct { 

    public readonly az1: string
    public readonly az2: string

    constructor(scope: Construct, id: string, props?: StfUtilProps) {
        super(scope, id)
       
        if(!azlist[`${Stack.of(this).region}`]){
            throw new Error('The stack is not yet available in the region selected')
          }
      
          const compatible_azs = azlist[`${Stack.of(this).region}`]
      
          const get_az_func_path = `${__dirname}/lambda/getAzs`
          const get_az_func = new Function(this, 'AzFunction', {
               runtime: Runtime.NODEJS_16_X,
               code: Code.fromAsset(get_az_func_path),
               handler: 'index.handler',
               timeout: Duration.seconds(50),
               environment: {
                  COMPATIBLE_AZS: JSON.stringify(compatible_azs)
                }
       
          })
          get_az_func.addToRolePolicy(new PolicyStatement({
            actions: ["ec2:DescribeAvailabilityZones"],
            resources: ['*'] 
           }))
        
           const get_az_provider = new Provider(this, 'cleanup_provider', {
            onEventHandler: get_az_func
          }) 
          
          const get_az = new CustomResource(this, 'get_az_custom', {
            serviceToken: get_az_provider.serviceToken
          })


        
          this.az1 = get_az.getAtt('az1').toString()
          this.az2 = get_az.getAtt('az2').toString()
       
          new CfnOutput(this, 'AZ1', {
            value: this.az1
          })
          new CfnOutput(this, 'AZ2', {
            value: this.az2
          })
      
    }
}
