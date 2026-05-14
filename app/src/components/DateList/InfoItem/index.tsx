import styles from "./InfoItem.module.css";

type Props = {
  label: string
  value: string | number | null | undefined
}

export default function InfoItem({ label, value }: Props) {
  return (
    <div className={styles.item}>
      <div className={styles.label}>{label}</div>
      <div className={styles.value}>{value}</div>
    </div>
  )
}