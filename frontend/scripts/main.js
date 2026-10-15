import { iniciarEstilosDinamicos } from "./core/estilos-dinamicos.js";
import { iniciarApi, db, downloads } from "./core/api.js";
import { S, CFG_PADRAO, iniciarCoreEstado } from "./core/estado.js";
import { render } from "./core/render.js";
import { $ } from "./core/dom.js";
import { iniciarConta } from "./features/conta.js";
import { iniciarPresenca } from "./features/presenca.js";
import { iniciarFeaturesBeneficiosExtras } from "./features/beneficios-extras.js";
import { iniciarFeaturesCadastroTransporte } from "./features/cadastro-transporte.js";
import { iniciarFeaturesConfiguracoes } from "./features/configuracoes.js";
import { iniciarFeaturesExportacao } from "./features/exportacao.js";
import { iniciarFeaturesFuncionariosFormulario } from "./features/funcionarios/formulario.js";
import { iniciarFeaturesOcorrenciasFormulario } from "./features/ocorrencias/formulario.js";
import { iniciarFeaturesPanoramaDetalhes } from "./features/panorama/detalhes.js";
import { iniciarFeaturesRemuneracao } from "./features/remuneracao.js";
import { iniciarFolha } from "./features/folha/controlador.js";
import { iniciarCoreNavegacao } from "./core/navegacao.js";
async function iniciar() {
  try {
    const usuario = await iniciarApi();
    iniciarEstilosDinamicos();
    iniciarCoreEstado();
    iniciarFeaturesBeneficiosExtras();
    iniciarFeaturesCadastroTransporte();
    iniciarFeaturesConfiguracoes();
    iniciarFeaturesExportacao();
    iniciarFeaturesFuncionariosFormulario();
    iniciarFeaturesOcorrenciasFormulario();
    iniciarFeaturesPanoramaDetalhes();
    iniciarFeaturesRemuneracao();
    iniciarCoreNavegacao();
    iniciarFolha();
    iniciarConta(usuario);
    iniciarPresenca(usuario);
    S.db = db;
    $("#export").hidden = !downloads;
    render();
    let fOk = false,
      oOk = false;
    const mudou = () => {
      S.ready = fOk && oOk;
      render();
    };
    const falhou = e => {
      if (e?.code === "revoked") {
        S.offline = true;
        render();
      }
    };
    const linhas = snap => snap.docs.map(d => ({
      ...d.data(),
      id: d.id
    }));
    db.collection("funcionarios").onSnapshot(s => {
      S.func = linhas(s);
      fOk = true;
      mudou();
    }, falhou);
    db.collection("ocorrencias").onSnapshot(s => {
      S.ocs = linhas(s);
      oOk = true;
      mudou();
    }, falhou);
    db.doc("config/remuneracao").onSnapshot(d => {
      S.rem = d.exists ? d.data() : null;
      render();
    }, falhou);
    db.doc("config/beneficios").onSnapshot(d => {
      S.cfg = {
        ...CFG_PADRAO,
        ...(d.exists ? d.data() : {})
      };
      render();
    }, falhou);
  } catch (erro) {
    if (erro?.code !== "revoked") {
      S.offline = true;
      S.ready = true;
      render();
      console.error("Não foi possível iniciar o painel.", erro);
    }
  }
}
iniciar();
