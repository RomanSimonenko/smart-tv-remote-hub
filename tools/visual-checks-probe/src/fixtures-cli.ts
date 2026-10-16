import {parseArgs} from 'node:util';
import {generateFixtures} from './fixtures.js';
const {values}=parseArgs({options:{output:{type:'string'}}});
if(!values.output)throw new Error('Provide --output <directory>');
await generateFixtures(values.output);
