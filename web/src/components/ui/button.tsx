import type { ComponentProps } from 'react'
import { Slot } from 'radix-ui'
import { cn } from '@/lib/utils'

export function Button({ asChild = false, variant = 'default', className, ...props }: ComponentProps<'button'> & { asChild?: boolean; variant?: 'default' | 'outline' | 'ghost' }) {
  const Component = asChild ? Slot.Root : 'button'
  return <Component className={cn('button', `button-${variant}`, className)} {...props} />
}
