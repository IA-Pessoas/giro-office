import { canSSRAuth } from '@modules/auth';
import { DepartmentRoutePage } from '@modules/departments/components/DepartmentRoutePage';

export default function FiscalPage() {
  return <DepartmentRoutePage title="Fiscal" />;
}

export const getServerSideProps = canSSRAuth(async () => {
  return {
    props: {},
  };
});
