#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { StfCoreStack } from '../lib/stf-core-stack';

const app = new cdk.App();

new StfCoreStack(app, 'StfCore', {
    stackName: 'StfCore',
    env: {region: 'eu-west-1'}
})