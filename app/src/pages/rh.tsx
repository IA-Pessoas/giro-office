import { canSSRAuth } from '@modules/auth';
import { DepartmentRoutePage } from '@modules/departments/components/DepartmentRoutePage';

export default function RHPage() {
  return <DepartmentRoutePage title="RH" />;
}

export const getServerSideProps = canSSRAuth(async () => {
  return {
    props: {},
  };
});
