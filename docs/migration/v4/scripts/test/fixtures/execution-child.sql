INSERT INTO `legacy`.`child` (`id`, `parent_id`, `acao`, `cpf`, `senha`) VALUES
  (1, 10, 'emitir', '123.456.789-09', 'segredo-preparado'),
  (2, 20, 'omitir', '987.654.321-00', 'segredo-omitido'),
  (3, 999, 'emitir', '111.222.333-44', 'segredo-quarentena');
