import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'
export function Card({ className, ...props }: ComponentProps<'section'>) { return <section data-slot="card" className={cn('card', className)} {...props} /> }
export function CardHeader({ className, ...props }: ComponentProps<'div'>) { return <div data-slot="card-header" className={cn('card-header', className)} {...props} /> }
export function CardContent({ className, ...props }: ComponentProps<'div'>) { return <div data-slot="card-content" className={cn('card-content', className)} {...props} /> }
