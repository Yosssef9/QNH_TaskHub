// @vitest-environment jsdom
import '@/test/setup'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { i18n } from '@/i18n'
import { TaskTeamIndicator } from './TaskTeamIndicator'

const summary = {
  teamTask:true, teamMemberCount:4, mainAssigneeCount:2, mainCompletedCount:1,
  teamRoster:[
    {userId:573,userName:'Yasser Hamza',userCode:'2101',email:'yasser@qnhospital.com.sa',mainAssignee:true},
    {userId:750,userName:'Sami Mubarak',userCode:'2174',email:'sami@qnhospital.com.sa',mainAssignee:true},
    {userId:801,userName:'Ahmed Ali',userCode:'2205',email:null,mainAssignee:false},
    {userId:802,userName:'Sara Saleh',userCode:'2206',email:'sara@qnhospital.com.sa',mainAssignee:false},
  ],
}
beforeEach(async()=>{await i18n.changeLanguage('en')})
afterEach(async()=>{await i18n.changeLanguage('ar')})

describe('collaborative task card',()=>{
  it('shows team count, three initials plus overflow, and aggregate progress',()=>{
    render(<TaskTeamIndicator summary={summary} subtaskTotal={3} subtaskCompleted={2}/>)
    expect(screen.getByText('Team · 4')).toBeInTheDocument()
    expect(screen.getByText('+1')).toBeInTheDocument()
    expect(screen.getByText('Main assignments 1/2 completed')).toBeInTheDocument()
    expect(screen.getByText('Subtasks 2/3 completed')).toBeInTheDocument()
    expect(screen.queryByText('Ahmed Ali')).not.toBeInTheDocument()
  })
  it('opens a searchable directory including user codes, emails, and main/subtask scope',async()=>{
    const user=userEvent.setup()
    render(<TaskTeamIndicator summary={summary}/>)
    await user.click(screen.getByRole('button',{name:'View assigned team'}))
    expect(await screen.findByText('Yasser Hamza')).toBeInTheDocument()
    expect(screen.getByText('Code: 2101 · Main task')).toBeInTheDocument()
    expect(screen.getByText('Code: 2205 · Subtask only')).toBeInTheDocument()
    await user.type(screen.getByRole('textbox',{name:'Search name, code or email…'}),'sara@')
    expect(screen.getByText('Sara Saleh')).toBeInTheDocument()
    expect(screen.queryByText('Yasser Hamza')).not.toBeInTheDocument()
  })
  it('opens when the team badge is hovered and keeps the roster searchable',async()=>{
    render(<TaskTeamIndicator summary={summary}/>)
    fireEvent.pointerEnter(screen.getByRole('button',{name:'View assigned team'}), {pointerType:'mouse'})
    expect(await screen.findByText('Yasser Hamza')).toBeInTheDocument()
    expect(screen.getByRole('textbox',{name:'Search name, code or email…'})).toBeInTheDocument()
  })

})
