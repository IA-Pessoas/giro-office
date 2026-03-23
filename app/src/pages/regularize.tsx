import { canSSRAuth } from '@modules/auth';
import { DepartmentRoutePage } from '@modules/departments/components/DepartmentRoutePage';

export default function RegularizePage() {
  return <DepartmentRoutePage title="Regularize" />;
}

export const getServerSideProps = canSSRAuth(async () => {
  return {
    props: {},
  };
});
