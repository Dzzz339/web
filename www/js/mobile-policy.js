(function() {
  'use strict';

  var mobileQuery = window.matchMedia('(max-width: 768px)');
  var scanScheduled = false;
  var desktopOnlyText = 'Полное редактирование доступно в веб-версии';
  var heavyPages = ['contracts', 'sub_contracts', 'sub_pricelists', 'customer_tariffs', 'users', 'templates'];
  var readonlyScopes = [
    '#contract_detail_modal',
    '#contract_form_modal',
    '#_sub_contract_modal_backdrop',
    '#sub_contract_modal_backdrop',
    '#_sub_price_modal_backdrop',
    '#sub_price_modal_backdrop',
    '#_sub_items_modal_backdrop',
    '#sub_items_modal_backdrop',
    '#_edit_tmpl_modal',
    '#cardSmrCalculatorBlock',
    '#user_add_card'
  ];
  var readonlyScopeSelector = readonlyScopes.join(', ');

  function isMobileLayout() {
    return mobileQuery.matches || document.body.classList.contains('is-native-phone') || document.body.classList.contains('in-phone-frame');
  }

  function showDesktopOnlyNotice() {
    if (!document.querySelector('.mobile-native-dialog')) window.alert(desktopOnlyText);
    return false;
  }

  window.showMobileDesktopOnly = showDesktopOnlyNotice;

  function getActionSource(element) {
    return ['onclick', 'onchange', 'oninput'].map(function(attribute) {
      return element.getAttribute(attribute) || '';
    }).join(';');
  }

  function isDesktopOnlyAction(element) {
    var isSubmit = element.matches('input[type="submit"], button[type="submit"], button:not([type])') && element.closest('form');
    if (isSubmit && element.closest(readonlyScopeSelector)) return true;

    var actionElement = element.closest('[onclick], [onchange], [oninput]');
    var source = actionElement ? getActionSource(actionElement) : '';
    if (element.id === '_msave' && window.S && S.page === 'users') return true;
    if (!source) return false;

    if (/openSubcontractWizardModal|openContractForm\s*\(|openCreateTemplateModal|openEditTemplateModal|_deleteTemplate|_saveTemplateForm/.test(source)) return true;
    if (/toggleUserForm|addUser\s*\(|editUser\s*\(|deleteUser\s*\(|openAddSpecialistModal|editSpecialist|deleteSpecialist|openAddPoaModal|editPoa\s*\(|deletePoa\s*\(|uploadSpecialistsFile|uploadPoaFile|uploadAndParsePoaFile|exportPoaToExcel|downloadPoaTemplateExcel|input_upload_/.test(source)) return true;

    var inContract = element.closest('#contract_detail_modal, #contract_form_modal, #contract_detail_modal_backdrop, #contract_form_modal_backdrop') ||
      (window.S && S.page === 'contracts' && element.closest('#app'));
    if (inContract && /saveContract|resetContract|_onContractFieldChange|deleteContract|deleteCardDocument|openAssignContractManager|promptEditContractContacts|openAddContractMaterials|triggerContractAttachment|openContractLawTypeQuick|openContractPriorityQuick|openContractStatusQuick|toggleEditTermsText|saveTermsText|openAddAgreement|openEditAgreement|deleteAgreement|openLinkTaskToContract|goToScenario3WithContract|unlinkTaskFromContract|saveContractCloudUrl|clearContractCloudUrl|promptCloudUrl|deleteContractAttachment|openChecklistAttachment|removeChecklistAttachment|removeContractChecklistItem|openAddContractCustomReq|toggleContractPaymentStatus|deleteContractPayment|openAddContractPayment|openContractPenalties|triggerContractsImport/.test(source)) return true;

    var inSubcontract = element.closest('#cardSmrCalculatorBlock, #_subcontract_wizard_modal, #_sub_contract_modal_backdrop, #sub_contract_modal_backdrop, #_sub_price_modal_backdrop, #sub_price_modal_backdrop, #_sub_items_modal_backdrop, #sub_items_modal_backdrop') ||
      (window.S && ['sub_contracts', 'sub_pricelists', 'customer_tariffs'].includes(S.page) && element.closest('#app'));
    if (inSubcontract) {
      if (/openSubContractModal\s*\(\s*\)|openSubContractModal\s*\(\s*null|openSubPriceListModal\s*\(\s*\)|openSubPriceListModal\s*\(\s*null|deleteSubContract|deleteSubPriceList|deleteSubPriceListItem|saveSubPriceListItem|addNewPriceListItem|saveSubContract|saveSubPriceList|openQuickSubcontractCreateModal/.test(source)) return true;
      if (element.closest('#cardSmrCalculatorBlock, #_subcontract_wizard_modal') && /_saveCardSmrSpec|_addCardSmrLine|_removeCardSmrLine|_addThirdPartyLine|_removeThirdPartyLine|_setSmrRounding|saveAndCreateAgreement|addNewSubcontractToTask|_applyContractorContract|openQuickSubcontractCreateModal|editCardTechLink|openContractorPicker|removeContractorFromTask|_toggleSmrAddMenu|_addCustomCardSmrLine|_openBudgetDistributor|_wizSubmit|_wizClearContractor|_wizSelectContractor/.test(source)) return true;
    }

    if (element.closest('#_doc_editor_modal') && /_saveDocEditor|_triggerEditorScanUpload|_onDocStatusChange|_docCmd|_insertDocTableRow|_deleteDocTableRow|_refreshDocFromTemplate|_toggleVariablesMenu|_insertVariableToDoc|_onSwitchDocTemplate/.test(source)) return true;
    return false;
  }

  function guardDesktopAction(e) {
    if (!isMobileLayout()) return;
    var element = e.target.closest('button, a, input, select, textarea, [onclick], [onchange], [oninput]');
    if (!element || !isDesktopOnlyAction(element)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    showDesktopOnlyNotice();
  }

  function guardDesktopSubmit(e) {
    if (!isMobileLayout() || !e.target.closest(readonlyScopeSelector)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    showDesktopOnlyNotice();
  }

  function setFieldReadonly(field) {
    if (!field._mobileReadonlyState) {
      field._mobileReadonlyState = { disabled: field.disabled, readOnly: field.readOnly };
      field.setAttribute('data-mobile-readonly-field', '');
    }
    if (field.matches('select, input[type="checkbox"], input[type="radio"], input[type="file"], input[type="button"], input[type="submit"]')) {
      field.disabled = true;
    } else if (field.matches('input, textarea')) {
      field.readOnly = true;
    }
  }

  function restoreDesktopFields() {
    document.querySelectorAll('[data-mobile-readonly-field]').forEach(function(field) {
      if (field._mobileReadonlyState) {
        field.disabled = field._mobileReadonlyState.disabled;
        field.readOnly = field._mobileReadonlyState.readOnly;
        delete field._mobileReadonlyState;
      }
      field.removeAttribute('data-mobile-readonly-field');
    });
    document.querySelectorAll('.mobile-readonly-note').forEach(function(note) { note.remove(); });
  }

  function addReadonlyNote(root) {
    if (!root || root.querySelector(':scope > .mobile-readonly-note')) return;
    var note = document.createElement('div');
    note.className = 'mobile-readonly-note';
    note.textContent = desktopOnlyText + '. На телефоне доступен просмотр данных.';
    var sheetBar = root.querySelector(':scope > .mobile-sheet-bar');
    if (sheetBar) sheetBar.insertAdjacentElement('afterend', note);
    else root.insertBefore(note, root.firstChild);
  }

  function scanMobilePolicy() {
    scanScheduled = false;
    if (!isMobileLayout()) {
      restoreDesktopFields();
      return;
    }

    var app = document.getElementById('app');
    if (app && window.S && heavyPages.includes(S.page)) addReadonlyNote(app);

    readonlyScopes.forEach(function(selector) {
      document.querySelectorAll(selector).forEach(function(root) {
        addReadonlyNote(root);
        root.querySelectorAll('input, select, textarea').forEach(setFieldReadonly);
      });
    });
  }

  function schedulePolicyScan() {
    if (scanScheduled) return;
    scanScheduled = true;
    requestAnimationFrame(scanMobilePolicy);
  }

  document.addEventListener('click', guardDesktopAction, true);
  document.addEventListener('change', guardDesktopAction, true);
  document.addEventListener('submit', guardDesktopSubmit, true);
  document.addEventListener('DOMContentLoaded', function() {
    scanMobilePolicy();
    var observer = new MutationObserver(schedulePolicyScan);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  });

  if (mobileQuery.addEventListener) mobileQuery.addEventListener('change', schedulePolicyScan);
  else mobileQuery.addListener(schedulePolicyScan);
  window.enhanceMobilePolicy = schedulePolicyScan;
})();
