import PessoaFormPage from '@/components/cadastro/PessoaFormPage'

interface Props {
  searchParams: { papel?: string }
}

export default function NovaPessoaPage({ searchParams }: Props) {
  return <PessoaFormPage papelInicial={searchParams.papel} />
}
