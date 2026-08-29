import { QueryClientProvider } from '@tanstack/react-query'
import { MotionConfig } from 'motion/react'
import { RouterProvider } from 'react-router'

import { AppToaster } from '@/components/shared/AppToaster'
import { TooltipProvider } from '@/components/ui/tooltip'

import { queryClient } from './query-client'
import { router } from './router'
import { ThemeProvider } from './providers/ThemeProvider'
import { MuiDateProvider } from './providers/MuiDateProvider'

export function AppProviders() {
  return (
    <MotionConfig reducedMotion="user">
      <ThemeProvider>
        <MuiDateProvider>
          <QueryClientProvider client={queryClient}>
            <TooltipProvider>
              <RouterProvider router={router} />
              <AppToaster />
            </TooltipProvider>
          </QueryClientProvider>
        </MuiDateProvider>
      </ThemeProvider>
    </MotionConfig>
  )
}
