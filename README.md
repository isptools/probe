# ISPTools

Ferramenta Brasileira online para testes externos de rede.

Ferramenta criada pelo Brasileiro GIOVANE HELENO para resolução de vários problemas expostos na lista “CAIU?“, reune em um portal web uma série de ferramentas simples para que você, administrador de redes/sistemas, possa tirar suas próprias conclusões sobre o status de sua estrutura de forma independente, fugindo da máxima “aqui está tudo normal, o problema deve ser aí!”.

Agora Dockerizado, facilitando a instalação.

## Você vai precisar de...

*  Usuário não-root com privilégios sudo.
*  Recomendo máquina dedicada para o ISPTools, evite utilizar em máquinas com outras funções (firewall, erp, dns, etc).

## Em sua distro favorita, instale o Docker.

Instruções de instalação em https://www.docker.com/get-docker

Em distros mais atuais, pode tentar o instalador automático do docker, executando:

```sh
$ curl -fsSL https://get.docker.com/ | sh
```


## Faça o pull do ISPTools

Execute:

```sh
$ docker pull isptools/probe
```

Este comando fará o download do ISPTools para sua máquina, já totalmente configurado.

## Rode o ISPTools

Execute:

```sh
$ docker run --restart=always -p 8000:8000 -d isptools/probe
```

Este comando, executará o ISPTools em sua máquina, mapeando a porta 8000 (TCP) e configurando para inicializar na inicialização da máquina.


## Pronto!

Agora vá em http://www.isptools.com.br/painel e ative seu servidor.



## Contribua com o código!

O código do probe é aberto, contribua:

https://github.com/isptools/isptools


## Dúvidas?

Entre em contato contato@isptools.com.br para maiores informações.
