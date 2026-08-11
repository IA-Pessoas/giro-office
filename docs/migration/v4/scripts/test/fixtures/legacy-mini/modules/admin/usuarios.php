<?php

$usuarios = Painel::select("SELECT * FROM tb_admin.usuarios WHERE ativo = 1");
$tabela = "tb_admin.usuarios";
$novo = "INSERT INTO tb_admin.usuarios (nome) VALUES ('não versionar')";
$alteracao = "UPDATE tb_admin.usuarios SET ativo = 0 WHERE id = 7";
$remocao = "DELETE FROM tb_admin.usuarios WHERE id = 8";
$permissoes = "SELECT * FROM tb_admin.permissoes_{$modulo}";
