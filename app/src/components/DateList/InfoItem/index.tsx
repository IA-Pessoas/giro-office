import {
  Box,
  Text,
} from "@chakra-ui/react";

type Props = {
  label: string
  value: string | number | null | undefined
}

export default function InfoItem({ label, value }: Props) {
  return (
    <Box>
      <Text fontWeight="bold">{label}</Text>
      <Text>{value}</Text>
    </Box>
  )
}