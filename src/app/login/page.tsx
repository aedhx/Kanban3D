import { redirect } from 'next/navigation'
import { isAuthenticated } from '@/lib/auth'
import { LoginForm } from '@/components/LoginForm'

export const dynamic = 'force-dynamic'

export default async function LoginPage() {
  if (await isAuthenticated()) redirect('/')
  return <LoginForm />
}
