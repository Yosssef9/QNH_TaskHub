import { describe,expect,it } from 'vitest'
import { appIcons } from '@/config/app-icons'

describe('Tag icon compatibility',()=>{
 it('exposes the existing TaskHub icon library for reusable personal tags',()=>{
   expect(Object.keys(appIcons).length).toBeGreaterThan(30)
   expect(appIcons['shield-check']).toBeDefined()
   expect(appIcons['clipboard-check']).toBeDefined()
 })
})
