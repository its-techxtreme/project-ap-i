import { redirect } from 'next/navigation'

/** Legacy submit route — public form now lives at `/`. */
export default function SubmitRedirectPage() {
  redirect('/')
}
