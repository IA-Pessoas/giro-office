import { useEffect, useState } from 'react';
import { Select, FormLabel, Flex } from '@chakra-ui/react';

type StateCityProps = {
    initialState: string;
    initialCity: string;
    onChangeState: (uf: string) => void;
    onChangeCity: (cidade: string) => void;
};

export default function StateCity({ initialState, initialCity, onChangeState, onChangeCity }: StateCityProps) {
  const [estados, setEstados] = useState([]);
  const [cidades, setCidades] = useState([]);
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
    <Flex w="100%" direction="row" gap={2}>
        <Flex w="50%" direction="column" justifyContent={'flex-end'}>
            <FormLabel htmlFor="estado">Estado</FormLabel>
            <Select
                id="estado"
                placeholder="Selecione o estado"
                value={estadoSelecionado}
                onChange={(e) => setEstadoSelecionado(e.target.value)}
                borderColor='main.divisor'
            >
                {estados.map((estado) => (
                    <option key={estado.id} value={estado.sigla}>
                    {estado.nome}
                    </option>
                ))}
            </Select>
        </Flex>

        <Flex w="50%" direction="column" justifyContent={'flex-end'}>
            <FormLabel htmlFor="cidade">Cidade</FormLabel>
            <Select
                id="cidade"
                placeholder="Selecione a cidade"
                value={cidadeSelecionada}
                onChange={(e) => setCidadeSelecionada(e.target.value)}
                isDisabled={!estadoSelecionado}
                borderColor='main.divisor'
            >
                {cidades.map((cidade) => (
                    <option key={cidade.id} value={cidade.nome}>
                        {cidade.nome}
                    </option>
                ))}
            </Select>
        </Flex>
    </Flex>
  );
}