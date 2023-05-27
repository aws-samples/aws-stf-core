#!/usr/bin/env node
import { App } from 'aws-cdk-lib';
import { StfCoreStack } from '../lib/stf-core-stack';
import { Parameters } from '../parameters';

const app = new App();

new StfCoreStack(app, 'StfCore', {
    stackName: 'StfCore',
    env: { region: Parameters.aws_region }
})