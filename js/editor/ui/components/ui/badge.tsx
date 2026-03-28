import * as React from 'react';

import { cn } from '../../utils';

type BadgeProps = React.HTMLAttributes<HTMLSpanElement> & {
    variant?: 'default' | 'outline';
};

function Badge({ className, variant = 'default', ...props }: BadgeProps) {
    return (
        <span
            className={cn(
                'inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.2em]',
                variant === 'default' && 'border-white/10 bg-white/[0.06] text-[color:var(--accent-strong)]',
                variant === 'outline' && 'border-white/12 bg-transparent text-[color:var(--text-dim)]',
                className
            )}
            {...props}
        />
    );
}

export { Badge };
