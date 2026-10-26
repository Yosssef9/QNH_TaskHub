import { describe, expect, it } from 'vitest';
import { renderGeneralTaskEmail } from '../../src/modules/email/templates/general-task-email.js';
import { renderMeetingActionItemEmail } from '../../src/modules/email/templates/meeting-action-item-email.js';

const context={taskHubUrl:'https://taskhub.example.test/',logoUrl:'cid:test'};

describe('Assignment and discussion email presentation',()=>{
  it('shows the actual assigning employee on general assignment emails',()=>{
    const document=renderGeneralTaskEmail('GENERAL_TASK_ASSIGNED',{
      taskTitle:'Emergency report',assignedByName:'Ahmed Mohammed',href:'/assigned-to-me?taskId=119',
    },'en',context);
    expect(document.html).toContain('Assigned by');
    expect(document.text).toContain('Ahmed Mohammed');
  });
  it('shows the meeting task assigner on action-item emails',()=>{
    const document=renderMeetingActionItemEmail('MEETING_ACTION_ITEM_ASSIGNED',{
      taskTitle:'Action item',contextTitle:'Quality meeting',assignedByName:'Committee Organizer',href:'/assigned-to-me?taskId=20',
    },'en',context);
    expect(document.html).toContain('Assigned by');
    expect(document.text).toContain('Committee Organizer');
  });
  it('escapes user-authored message content in mention emails',()=>{
    const document=renderGeneralTaskEmail('TASK_DISCUSSION_MENTION',{
      taskTitle:'Emergency report',senderName:'Ahmed Mohammed',
      messagePreview:'@2101 review <script>alert(1)</script> & reply',
      href:'/discussions?taskId=119&messageId=17',
    },'en',context);
    expect(document.html).toContain('Mentioned by');
    expect(document.html).toContain('&lt;script&gt;');
    expect(document.html).not.toContain('<script>');
    expect(document.text).toContain('review <script>');
    expect(document.html).toContain('messageId=17');
  });
  it('does not disclose task information in a revoked assignment email',()=>{
    const document=renderGeneralTaskEmail('GENERAL_ASSIGNMENT_REMOVED',{
      taskTitle:'Private task',assignedByName:'Private actor',notice:'Removed',
    },'en',context);
    expect(document.html).not.toContain('Private task');
    expect(document.text).not.toContain('Private actor');
  });
});
