import { useEffect, useState } from 'react';
import styles from './StateCity.module.css';

type StateCityProps = {
    initialState: string;
    initialCity: string;
    onChangeState: (uf: string) => void;
    onChangeCity: (cidade: string) => void;
};

type UF = {
  id: number;
  sigla: string;
  nome: string;
};

type City = {
  id: number;
  nome: string;
};

export default function StateCity({ initialState, initialCity, onChangeState, onChangeCity }: StateCityProps) {
  const [estados, setEstados] = useState<UF[]>([]);
  const [cidades, setCidades] = useState<City[]>([]);
  const [estadoSelecionado, setEstadoSelecionado] = useState(initialState || '');
  const [cidadeSelecionada, setCidadeSelecionada] = useState(initialCity || '');

  useEffect(() => {
    // Buscar estados ao carregar o componente
    fetch('https://servicodados.ibge.gov.br/api/v1/localidades/estados?orderBy=nome')
      .then((res) => res.json())
      .then((data) => setEstados(data));
  }, []);

  useEffect(() => {
    if (estadoSelecionado) {
      // Buscar cidades quando um estado for selecionado
      fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${estadoSelecionado}/municipios`)
        .then((res) => res.json())
        .then((data) => setCidades(data));
        onChangeState(estadoSelecionado); 
    } else {
      setCidades([]);
    }
  }, [estadoSelecionado]);

  useEffect(() => {
    if (cidadeSelecionada) {
      onChangeCity(cidadeSelecionada); // envia para o componente pai
    }
  }, [cidadeSelecionada]);

  return (
    <div className={styles.row}>
      <div className={styles.field}>
        <label htmlFor="estado" className={styles.label}>Estado</label>
        <select
          id="estado"
          value={estadoSelecionado}
          onChange={(e) => setEstadoSelecionado(e.target.value)}
          className={styles.select}
        >
          <option value="">Selecione o estado</option>
          {estados.map((estado) => (
            <option key={estado.id} value={estado.sigla}>
              {estado.nome}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.field}>
        <label htmlFor="cidade" className={styles.label}>Cidade</label>
        <select
          id="cidade"
          value={cidadeSelecionada}
          onChange={(e) => setCidadeSelecionada(e.target.value)}
          disabled={!estadoSelecionado}
          className={styles.select}
        >
          <option value="">Selecione a cidade</option>
          {cidades.map((cidade) => (
            <option key={cidade.id} value={cidade.nome}>
              {cidade.nome}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}