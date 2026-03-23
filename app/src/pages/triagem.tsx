import { canSSRAuth } from '@modules/auth';
import { DepartmentRoutePage } from '@modules/departments/components/DepartmentRoutePage';

export default function TriagemPage() {
  return <DepartmentRoutePage title="Triagem" />;
}

export const getServerSideProps = canSSRAuth(async () => {
  return {
    props: {},
  };
});
