import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Stepper } from './Stepper'
import type { StepDef, StepSlug } from '@/lib/onboarding/steps'

interface OnboardingShellProps {
  steps:       StepDef[]
  currentSlug: StepSlug
  title:       string
  description: string
  children:    React.ReactNode
}

/** Shared card + stepper wrapper used by every step page. */
export function OnboardingShell({ steps, currentSlug, title, description, children }: OnboardingShellProps) {
  return (
    <div className="space-y-8">
      <Stepper steps={steps} currentSlug={currentSlug} />
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    </div>
  )
}
