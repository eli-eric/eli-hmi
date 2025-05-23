'use client'

import * as React from 'react'
import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import clsx from 'clsx'
import styles from './tooltip.module.css'

const TooltipProvider = TooltipPrimitive.Provider

const TooltipRoot = TooltipPrimitive.Root

const TooltipTrigger = TooltipPrimitive.Trigger

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={clsx(styles.TooltipContent, className)}
      collisionPadding={8}
      avoidCollisions={true}
      {...props}
    />
  </TooltipPrimitive.Portal>
))
TooltipContent.displayName = TooltipPrimitive.Content.displayName

const Tooltip = ({
  content,
  children,
  delayDuration = 300,
  side = 'top',
}: {
  content: React.ReactNode | string
  children: React.ReactNode
  delayDuration?: number
  side?: 'top' | 'right' | 'bottom' | 'left'
}) => {
  return (
    <TooltipRoot delayDuration={delayDuration}>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side}>{content}</TooltipContent>
    </TooltipRoot>
  )
}

export { Tooltip, TooltipProvider }
