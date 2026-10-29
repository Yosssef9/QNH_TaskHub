import { describe, expect, it } from 'vitest';
import { extractDiscussionLinks } from '../../src/modules/task-discussions/task-discussions.shared.js';

describe('shared discussion web link extraction',()=>{
  it('indexes multiple web links within one message',()=>{
    expect(extractDiscussionLinks('Read https://example.com/report and http://intranet.local/docs now')).toEqual([
      {url:'https://example.com/report',domain:'example.com'},
      {url:'http://intranet.local/docs',domain:'intranet.local'},
    ]);
  });
  it('omits unsafe/non-web protocols and trims sentence punctuation',()=>{
    expect(extractDiscussionLinks('javascript:alert(1) ftp://files.local/a https://example.com/file.pdf,')).toEqual([
      {url:'https://example.com/file.pdf',domain:'example.com'},
    ]);
  });
  it('keeps meaningful balanced parentheses in a URL',()=>{
    expect(extractDiscussionLinks('See (https://en.wikipedia.org/wiki/Test_(example)).')).toEqual([
      {url:'https://en.wikipedia.org/wiki/Test_(example)',domain:'en.wikipedia.org'},
    ]);
  });
  it('returns no links for messages without web URLs',()=>{
    expect(extractDiscussionLinks('No link in this update')).toEqual([]);
  });
});
