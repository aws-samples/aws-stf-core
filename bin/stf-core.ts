#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { StfCoreStack } from '../lib/stf-core-stack';

const app = new cdk.App();

new StfCoreStack(app, 'StfCore', {})