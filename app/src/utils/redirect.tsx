import { useRouter } from 'next/router';
import styles from './redirect.module.css';

export function Redirect ({ nome, rota }) {
  const router = useRouter();

  const gerarPDFGeral = () => {
    const newWindow = window.open(rota, '_blank', 'height=720,width=1280');

    if (newWindow) {
      newWindow.focus();
    } else {
      alert('A nova janela não pôde ser aberta. Verifique as configurações do bloqueador de pop-up.');
    }
  };

  return (
      <button type="button" className={styles.button} onClick={gerarPDFGeral}>
        {nome}
      </button>
    );
};
