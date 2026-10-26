import { describe,expect,it } from 'vitest';
import { mentionedMemberIds } from '../../src/modules/task-discussions/task-discussions.mentions.js';
const people=[{userId:11,userCode:'2101'},{userId:22,userCode:'ABC2'}];
describe('stable mention parser',()=>{
 it('matches eligible codes, de-duplicates and ignores unknown identities',()=>{
   expect(mentionedMemberIds('hi @2101 @ABC2, @2101 @999',people)).toEqual([11,22]);
 });
 it('does not treat email addresses or embedded codes as mentions',()=>{
   expect(mentionedMemberIds('mail@2101.com helloA@ABC2',people)).toEqual([]);
 });
});
