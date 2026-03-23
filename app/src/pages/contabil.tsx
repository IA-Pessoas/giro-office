import { canSSRAuth } from '@modules/auth';
import { DepartmentRoutePage } from '@modules/departments/components/DepartmentRoutePage';

export default function ContabilPage() {
  return <DepartmentRoutePage title="Contabil" />;
}

export const getServerSideProps = canSSRAuth(async () => {
  return {
    props: {},
  };
});
